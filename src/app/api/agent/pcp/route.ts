import { comLogDoRobo } from "@/modules/agent/lib/governance";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Robô PCP — acompanha prazo de cada pedido de venda aberto.
 * Autorização: Bearer AGENT_API_KEY, ou sessão de administrador.
 *
 * GET  [?pv=21]  → para cada PV aberto: prazo, compras ligadas (previsão, confirmação, atraso),
 *                  plano de produção, previsão de pronto e alertas. Sem alterar nada.
 *                  `?so_alertas=1` devolve só os PVs com alerta (é o que o n8n usa às 7h30).
 * POST { pv, etapa?, pronto?, solda?, pintura?, pcs?, nota? } → grava/atualiza o plano do PV.
 *
 * O plano fica no campo "resposta do PCP" do pedido (pcp_reply_comercial_observation), numa linha:
 *   PCP | etapa=compra | pronto=2026-11-21 | solda=sim | pintura=sim | pcs=43/2026,50/2026 | nota livre
 * e a data de pronto também em pcp_deadline (aparece no ERP).
 *
 * Prazos padrão (Helder, 17/11/2026): corte e dobra na Aço Líder 5 dias; com solda 10 dias;
 * pintura (Juselia) +3 dias; filtro conforme o orçamento do fornecedor; expedição imediata.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function resolveTenant(request: NextRequest, admin: Admin): Promise<string | NextResponse> {
  const key = (process.env.AGENT_API_KEY ?? "").trim();
  const sent = (request.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
  if (key && sent && sent === key) {
    const { data } = await admin.from("tenants").select("id").limit(1);
    return data?.[0]?.id ?? apiError("Tenant não encontrado", 403);
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
  return (await getCurrentTenantId()) ?? apiError("Tenant não encontrado", 403);
}

const ETAPAS = ["planejar", "compra", "chapa", "solda", "pintura", "montagem", "pronto", "expedido"] as const;
const DIAS_PINTURA = 3;
const DIAS_MONTAGEM = 1;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diff = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
const br = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "?");
const isoOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Etapa 4.2 — folga em dias úteis (seg–sex; feriados entram depois, na tabela do ERP).
const isUtil = (iso: string) => {
  const w = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
};
/** Dias úteis de `de` (exclusive) até `ate` (inclusive); negativo se `ate` < `de`. */
function uteisEntre(de: string, ate: string): number {
  if (ate === de) return 0;
  const sinal = ate > de ? 1 : -1;
  let n = 0;
  let d = de;
  while (d !== ate) {
    d = addDays(d, sinal);
    if (isUtil(d)) n += sinal;
  }
  return n;
}
type Prazos = { chapa: number; chapa_com_solda: number; pintura: number; fonte: string };
// Prazo pessimista (combinado + 20%) enquanto a tabela lead_times não responder.
const PRAZOS_PADRAO: Prazos = { chapa: 6, chapa_com_solda: 12, pintura: 4, fonte: "padrão do código (combinado + 20%)" };
async function lerPrazos(admin: Admin, tenant: string): Promise<Prazos> {
  const { data, error } = await asUntypedAdmin(admin)
    .from("lead_times")
    .select("fornecedor, etapa, dias")
    .eq("tenant_id", tenant);
  if (error || !data?.length) return PRAZOS_PADRAO;
  const p: Prazos = { ...PRAZOS_PADRAO, fonte: "tabela lead_times" };
  for (const r of data as Array<{ fornecedor: string; etapa: string; dias: number }>) {
    if (r.etapa === "chapa") p.chapa = r.dias;
    else if (r.etapa === "chapa_com_solda") p.chapa_com_solda = r.dias;
    else if (r.etapa === "pintura") p.pintura = r.dias;
  }
  return p;
}
const ANTES_DA_CHAPA = new Set(["planejar", "compra", "chapa", "solda"]);
const ANTES_DA_PINTURA = new Set(["planejar", "compra", "chapa", "solda", "pintura"]);

type Plano = {
  etapa?: string;
  pronto?: string;
  solda?: boolean;
  pintura?: boolean;
  pcs: string[];
  nota?: string;
};

function lerPlano(txt: string | null | undefined): Plano | null {
  const t = (txt ?? "").trim();
  if (!t.startsWith("PCP |")) return null;
  const p: Plano = { pcs: [] };
  const livres: string[] = [];
  for (const parte of t.split("|").slice(1).map((s) => s.trim()).filter(Boolean)) {
    const m = parte.match(/^(\w+)=(.*)$/);
    if (!m) {
      livres.push(parte);
      continue;
    }
    const [, k, v] = m;
    if (k === "etapa") p.etapa = v;
    else if (k === "pronto" && isoOk(v)) p.pronto = v;
    else if (k === "solda") p.solda = v === "sim";
    else if (k === "pintura") p.pintura = v === "sim";
    else if (k === "pcs") p.pcs = v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (livres.length) p.nota = livres.join(" | ");
  return p;
}

function escreverPlano(p: Plano): string {
  const partes = ["PCP"];
  if (p.etapa) partes.push(`etapa=${p.etapa}`);
  if (p.pronto) partes.push(`pronto=${p.pronto}`);
  if (p.solda !== undefined) partes.push(`solda=${p.solda ? "sim" : "nao"}`);
  if (p.pintura !== undefined) partes.push(`pintura=${p.pintura ? "sim" : "nao"}`);
  if (p.pcs.length) partes.push(`pcs=${p.pcs.join(",")}`);
  if (p.nota) partes.push(p.nota.replace(/\|/g, "/"));
  return partes.join(" | ");
}

type PV = {
  id: string;
  order_number: string;
  status: string;
  client_name: string | null;
  order_date: string | null;
  expected_delivery: string | null;
  pcp_deadline: string | null;
  pcp_reply_comercial_observation: string | null;
};

type PC = {
  id: string;
  po_number: string;
  status: string;
  expected_delivery: string | null;
  actual_delivery: string | null;
  supplier_id: string | null;
  order_date: string | null;
};

const ABERTOS = ["confirmed", "in_production"];

async function pedidos(admin: Admin, tenant: string, pv?: string): Promise<PV[]> {
  const db = asUntypedAdmin(admin);
  let q = db
    .from("sales_orders")
    .select("id, order_number, status, client_name, order_date, expected_delivery, pcp_deadline, pcp_reply_comercial_observation")
    .eq("tenant_id", tenant);
  if (pv) {
    const num = pv.match(/(\d+)\D*$/)?.[1] ?? "";
    q = q.ilike("order_number", `%${num.replace(/^0+/, "") || "0"}`);
  } else {
    q = q.in("status", ABERTOS);
  }
  const { data, error } = await q.order("expected_delivery", { ascending: true, nullsFirst: false }).limit(60);
  if (error) throw new Error(error.message);
  let lista = (data ?? []) as PV[];
  if (pv) {
    const num = pv.match(/(\d+)\D*$/)?.[1] ?? "";
    lista = lista.filter(
      (p) => p.order_number.toUpperCase() === pv.toUpperCase() || Number(p.order_number.split("-").pop()) === Number(num)
    );
  }
  return lista;
}

async function analisar(admin: Admin, tenant: string, lista: PV[]) {
  const db = asUntypedAdmin(admin);
  const hoje = todayIsoSaoPaulo();
  if (!lista.length) return { hoje, pedidos: [] };
  const prazos = await lerPrazos(admin, tenant);

  // Compras ligadas pelos itens (purchase_order_items.sales_order_item_id) …
  const { data: itensPv } = await db
    .from("sales_order_items")
    .select("id, sales_order_id")
    .eq("tenant_id", tenant)
    .in("sales_order_id", lista.map((p) => p.id));
  const pvDoItem = new Map<string, string>();
  for (const i of (itensPv ?? []) as Array<{ id: string; sales_order_id: string }>) pvDoItem.set(i.id, i.sales_order_id);
  const pcsPorPv = new Map<string, Set<string>>();
  if (pvDoItem.size) {
    const { data: itensPc } = await db
      .from("purchase_order_items")
      .select("purchase_order_id, sales_order_item_id")
      .eq("tenant_id", tenant)
      .in("sales_order_item_id", [...pvDoItem.keys()]);
    for (const i of (itensPc ?? []) as Array<{ purchase_order_id: string | null; sales_order_item_id: string }>) {
      const so = pvDoItem.get(i.sales_order_item_id);
      if (!so || !i.purchase_order_id) continue;
      if (!pcsPorPv.has(so)) pcsPorPv.set(so, new Set());
      pcsPorPv.get(so)!.add(i.purchase_order_id);
    }
  }
  // … e as anotadas no plano (pcs=43/2026,…)
  const planos = new Map(lista.map((p) => [p.id, lerPlano(p.pcp_reply_comercial_observation)]));
  const numeros = [...new Set([...planos.values()].flatMap((p) => p?.pcs ?? []))];
  const idsPc = [...new Set([...pcsPorPv.values()].flatMap((s) => [...s]))];
  const pcs: PC[] = [];
  const campos = "id, po_number, status, expected_delivery, actual_delivery, supplier_id, order_date";
  if (idsPc.length) {
    const { data } = await db.from("purchase_orders").select(campos).eq("tenant_id", tenant).in("id", idsPc);
    pcs.push(...((data ?? []) as PC[]));
  }
  if (numeros.length) {
    const { data } = await db.from("purchase_orders").select(campos).eq("tenant_id", tenant).in("po_number", numeros);
    for (const pc of (data ?? []) as PC[]) if (!pcs.some((x) => x.id === pc.id)) pcs.push(pc);
  }
  // … e as que citam o PV nas observações do PC ("Ref. PV-2026-0027 …").
  {
    const { data } = await db
      .from("purchase_orders")
      .select(campos + ", notes")
      .eq("tenant_id", tenant)
      .neq("status", "cancelled")
      .ilike("notes", "%PV-%")
      .order("order_date", { ascending: false })
      .limit(200);
    for (const pc of (data ?? []) as Array<PC & { notes: string | null }>) {
      const refs = String(pc.notes ?? "").match(/PV-\d{4}-\d+/gi) ?? [];
      for (const ref of refs) {
        const so = lista.find((x) => x.order_number.toUpperCase() === ref.toUpperCase());
        if (!so) continue;
        if (!pcsPorPv.has(so.id)) pcsPorPv.set(so.id, new Set());
        pcsPorPv.get(so.id)!.add(pc.id);
        if (!pcs.some((x) => x.id === pc.id)) pcs.push(pc);
      }
    }
  }
  const fornIds = [...new Set(pcs.map((p) => p.supplier_id).filter((x): x is string => !!x))];
  const forn = new Map<string, string>();
  if (fornIds.length) {
    const { data } = await db.from("suppliers").select("*").in("id", fornIds);
    for (const s of (data ?? []) as Array<Record<string, unknown>>) {
      forn.set(String(s.id), String(s.trade_name || s.name || s.company_name || "fornecedor").slice(0, 30));
    }
  }

  const saida = lista.map((pv) => {
    const plano = planos.get(pv.id) ?? null;
    const ligados = pcs.filter((pc) => pcsPorPv.get(pv.id)?.has(pc.id) || plano?.pcs.includes(pc.po_number));
    const alertas: string[] = [];
    const compras = ligados
      .filter((pc) => pc.status !== "cancelled")
      .map((pc) => {
        const recebido = pc.status === "received" || !!pc.actual_delivery;
        const confirmado = recebido || pc.status === "confirmed" || pc.status === "partial";
        const atrasado = !recebido && !!pc.expected_delivery && pc.expected_delivery < hoje;
        const quem = forn.get(pc.supplier_id ?? "") ?? "fornecedor";
        if (atrasado) alertas.push(`PC ${pc.po_number} (${quem}) atrasado: previsão era ${br(pc.expected_delivery)} — cobrar o fornecedor.`);
        else if (!recebido && !pc.expected_delivery) alertas.push(`PC ${pc.po_number} (${quem}) sem data de entrega — pedir previsão.`);
        else if (!confirmado && pc.status === "sent" && pc.order_date && diff(hoje, pc.order_date) >= 2)
          alertas.push(`PC ${pc.po_number} (${quem}) enviado há ${diff(hoje, pc.order_date)} dias sem confirmação.`);
        return {
          pc: pc.po_number,
          fornecedor: quem,
          status: pc.status,
          previsao: pc.expected_delivery,
          recebido,
          confirmado,
          atrasado,
        };
      });

    // Previsão de pronto: data combinada no plano, ou chegada da última compra + pintura + montagem.
    let pronto: string | null = plano?.pronto ?? null;
    let base = "plano";
    const pendentes = compras.filter((c) => !c.recebido);
    if (!pronto && compras.length) {
      const ultima = pendentes.map((c) => c.previsao).filter((d): d is string => !!d).sort().pop() ?? hoje;
      const chegada = ultima < hoje ? hoje : ultima;
      pronto = addDays(chegada, (plano?.pintura ? DIAS_PINTURA : 0) + DIAS_MONTAGEM);
      base = "compras";
    }
    const entrega = pv.expected_delivery;
    const folga = entrega && pronto ? diff(entrega, pronto) : null;
    const etapa = plano?.etapa ?? (compras.length ? (pendentes.length ? "compra" : "montagem") : "planejar");

    if (!entrega) alertas.push("Pedido sem data de entrega.");
    if (!plano && !compras.length && pv.status === "confirmed")
      alertas.push("Pedido sem plano: alinhar com o Helder o que compra, se tem solda/pintura e quando fica pronto.");
    if (folga !== null && folga < 0) alertas.push(`RISCO: previsão de pronto ${br(pronto)} passa da entrega ${br(entrega)} (${-folga} dia(s)).`);
    else if (folga !== null && folga <= 1 && etapa !== "pronto") alertas.push(`Apertado: pronto ${br(pronto)} para entrega ${br(entrega)}.`);
    if (entrega && entrega < hoje) alertas.push(`ATRASADO: entrega era ${br(entrega)}.`);
    else if (entrega && diff(entrega, hoje) <= 3 && etapa !== "pronto" && etapa !== "expedido")
      alertas.push(`Entrega em ${diff(entrega, hoje)} dia(s) e etapa ainda é "${etapa}".`);

    // Folga (4.2) = dias úteis até a entrega − dias úteis que ainda faltam.
    const pendentesSemAco = pendentes.filter((c) => !/l[ií]der/i.test(c.fornecedor));
    const acoPendente = pendentes.some((c) => /l[ií]der/i.test(c.fornecedor));
    const chegadaCompras = pendentesSemAco.map((c) => c.previsao).filter((d): d is string => !!d).sort().pop() ?? null;
    const diasCompra = chegadaCompras ? Math.max(0, uteisEntre(hoje, chegadaCompras)) : 0;
    const diasAco = ANTES_DA_CHAPA.has(etapa)
      ? acoPendente
        ? Math.max(0, uteisEntre(hoje, pendentes.filter((c) => /l[ií]der/i.test(c.fornecedor)).map((c) => c.previsao ?? hoje).sort().pop() ?? hoje))
        : plano?.solda
          ? prazos.chapa_com_solda
          : prazos.chapa
      : 0;
    const diasPintura = plano?.pintura && ANTES_DA_PINTURA.has(etapa) ? prazos.pintura : 0;
    const diasMontagem = etapa === "pronto" || etapa === "expedido" ? 0 : DIAS_MONTAGEM;
    const faltam = diasCompra + diasAco + diasPintura + diasMontagem;
    const ateEntrega = entrega ? uteisEntre(hoje, entrega) : null;
    const folgaUteis = ateEntrega === null ? null : ateEntrega - faltam;
    const encerrado = etapa === "pronto" || etapa === "expedido";
    const severidade: "critico" | "medio" | "baixo" =
      encerrado || folgaUteis === null
        ? alertas.length && !encerrado ? "medio" : "baixo"
        : (entrega && entrega < hoje) || folgaUteis <= 2
          ? "critico"
          : folgaUteis <= 5
            ? "medio"
            : "baixo";
    const conta = {
      folga_uteis: folgaUteis,
      uteis_ate_entrega: ateEntrega,
      faltam_uteis: faltam,
      partes: { compra: diasCompra, aco_lider: diasAco, pintura: diasPintura, montagem: diasMontagem },
      fonte_prazo: acoPendente ? "previsão do PC da Aço Líder + " + prazos.fonte : prazos.fonte,
      tratar_hoje: severidade === "medio" && folgaUteis === 3,
    };

    return {
      pv: pv.order_number,
      cliente: (pv.client_name ?? "").slice(0, 40),
      status: pv.status,
      entrega,
      dias_para_entrega: entrega ? diff(entrega, hoje) : null,
      etapa,
      plano,
      previsao_pronto: pronto,
      previsao_base: pronto ? base : null,
      folga_dias: folga,
      severidade,
      conta,
      dedupe_key: `pcp:${pv.order_number}:${hoje}`,
      compras,
      alertas,
    };
  });
  return { hoje, pedidos: saida };
}

function texto(r: Awaited<ReturnType<typeof analisar>>) {
  const comAlerta = r.pedidos.filter((p) => p.alertas.length);
  if (!comAlerta.length) return `PCP ${br(r.hoje)}: ${r.pedidos.length} pedido(s) aberto(s), nada em risco.`;
  return [
    `PCP ${br(r.hoje)}: ${comAlerta.length} de ${r.pedidos.length} pedido(s) pedem ação`,
    ...comAlerta.map(
      (p) => `• ${p.pv} ${p.cliente} — entrega ${br(p.entrega)}, etapa ${p.etapa}\n  ${p.alertas.join("\n  ")}`
    ),
  ].join("\n");
}

async function getHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const sp = request.nextUrl.searchParams;
  try {
    const r = await analisar(admin, tenant, await pedidos(admin, tenant, sp.get("pv") ?? undefined));
    const soAlertas = sp.get("so_alertas") === "1";
    return apiOk({
      hoje: r.hoje,
      tem_alerta: r.pedidos.some((p) => p.alertas.length),
      criticos: r.pedidos.filter((p) => p.severidade === "critico").map((p) => p.pv),
      medios: r.pedidos.filter((p) => p.severidade === "medio").map((p) => p.pv),
      texto: texto(r),
      pedidos: soAlertas ? r.pedidos.filter((p) => p.alertas.length) : r.pedidos,
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no PCP.", 500);
  }
}

async function postHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pv = String(b.pv ?? "").trim();
  if (!pv) return apiError("Informe pv.", 400);
  const achados = await pedidos(admin, tenant, pv);
  if (achados.length !== 1) return apiError(achados.length ? `Mais de um pedido bate com ${pv}.` : `Pedido ${pv} não encontrado.`, 404);
  const so = achados[0];
  const plano: Plano = lerPlano(so.pcp_reply_comercial_observation) ?? { pcs: [] };

  if (b.etapa !== undefined) {
    const e = String(b.etapa).toLowerCase();
    if (!(ETAPAS as readonly string[]).includes(e)) return apiError(`etapa deve ser: ${ETAPAS.join(", ")}.`, 400);
    plano.etapa = e;
  }
  if (b.pronto !== undefined) {
    if (b.pronto === null || b.pronto === "") delete plano.pronto;
    else if (isoOk(b.pronto)) plano.pronto = String(b.pronto);
    else return apiError("pronto deve ser AAAA-MM-DD.", 400);
  }
  if (typeof b.solda === "boolean") plano.solda = b.solda;
  if (typeof b.pintura === "boolean") plano.pintura = b.pintura;
  if (Array.isArray(b.pcs)) plano.pcs = [...new Set([...plano.pcs, ...b.pcs.map((x) => String(x).trim()).filter(Boolean)])];
  if (typeof b.nota === "string") plano.nota = b.nota.trim() || undefined;

  const db = asUntypedAdmin(admin);
  const agora = new Date().toISOString();
  const { error } = await db
    .from("sales_orders")
    .update({
      pcp_reply_comercial_observation: escreverPlano(plano),
      pcp_reply_comercial_observation_at: agora,
      pcp_deadline: plano.pronto ?? so.pcp_deadline,
    })
    .eq("id", so.id)
    .eq("tenant_id", tenant);
  if (error) return apiError(error.message, 500);
  const r = await analisar(admin, tenant, (await pedidos(admin, tenant, so.order_number)));
  return apiOk({ salvo: true, pedido: r.pedidos[0] });
}

export const GET = comLogDoRobo("pcp", "pcp", getHandler);
export const POST = comLogDoRobo("pcp", "pcp", postHandler);
