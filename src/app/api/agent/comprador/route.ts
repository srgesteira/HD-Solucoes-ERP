import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { calculateMaterialRequirements, processMrpForSalesOrder } from "@/modules/pcp/lib/mrp-service";
import { issueRequisitionsAsPurchaseOrder } from "@/modules/compras/lib/purchasing/requisition-issue";

import { comLogDoRobo, travaEfeitoExternoDoRobo } from "@/modules/agent/lib/governance";
import { exigirAprovacao } from "@/modules/agent/lib/approvals";
import { contextoFornecedorItem, limiteValidade } from "@/modules/agent/lib/learning";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Robô Comprador — usado pela HD Central (e chamado pelo PCP quando há pedido sem plano).
 * Autorização: Bearer AGENT_API_KEY, ou sessão de administrador.
 *
 * GET                → PVs confirmados que ainda não passaram pelo MRP + requisições de compra em aberto.
 * GET ?pv=28         → o que falta comprar para o PV (MRP: necessidade x estoque x a caminho),
 *                      agrupado por fornecedor preferido, com último custo; e as requisições já abertas do PV.
 * POST { pv, acao: "planejar" }  → roda o MRP do PV como no botão do ERP: cria as requisições de compra
 *                                  rastreadas ao pedido e a OP (igual ao "Confirmar" do MRP). Não manda nada para fora.
 * POST { acao: "emitir_pc", requisicoes: [ids], fornecedor_id? } → junta requisições num PC em rascunho.
 *                                  Enviar o PC ao fornecedor continua sendo com OK do Helder.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Quem = { tenant: string; userId: string };

async function resolver(request: NextRequest, admin: Admin): Promise<Quem | NextResponse> {
  const key = (process.env.AGENT_API_KEY ?? "").trim();
  const sent = (request.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
  if (key && sent && sent === key) {
    const { data } = await admin.from("tenants").select("id").limit(1);
    const tenant = data?.[0]?.id;
    if (!tenant) return apiError("Tenant não encontrado", 403);
    const { data: adm } = await asUntypedAdmin(admin)
      .from("user_profiles")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1);
    const userId = (adm?.[0] as { id?: string } | undefined)?.id;
    if (!userId) return apiError("Nenhum administrador no tenant.", 403);
    return { tenant, userId };
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
  const tenant = await getCurrentTenantId();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!tenant || !user) return apiError("Tenant não encontrado", 403);
  return { tenant, userId: user.id };
}

type PV = { id: string; order_number: string; client_name: string | null; status: string; expected_delivery: string | null; mrp_processed: boolean | null };

async function acharPv(admin: Admin, tenant: string, pv: string): Promise<PV | string> {
  const num = pv.match(/(\d+)\D*$/)?.[1] ?? "";
  if (!num) return "Informe o pedido (pv).";
  const { data, error } = await asUntypedAdmin(admin)
    .from("sales_orders")
    .select("id, order_number, client_name, status, expected_delivery, mrp_processed")
    .eq("tenant_id", tenant)
    .ilike("order_number", `%${num.replace(/^0+/, "") || "0"}`)
    .limit(20);
  if (error) return error.message;
  const certos = ((data ?? []) as PV[]).filter(
    (p) => p.order_number.toUpperCase() === pv.trim().toUpperCase() || Number(p.order_number.split("-").pop()) === Number(num)
  );
  if (certos.length === 1) return certos[0];
  return certos.length ? `Mais de um pedido bate com ${pv}.` : `Pedido ${pv} não encontrado.`;
}

async function requisicoesDoPv(admin: Admin, tenant: string, soId: string) {
  const db = asUntypedAdmin(admin);
  const { data: itens } = await db
    .from("sales_order_items")
    .select("id, production_order_id")
    .eq("tenant_id", tenant)
    .eq("sales_order_id", soId);
  const linhas = (itens ?? []) as Array<{ id: string; production_order_id: string | null }>;
  const idsItem = linhas.map((l) => l.id);
  const idsOp = [...new Set(linhas.map((l) => l.production_order_id).filter((x): x is string => !!x))];
  if (!idsItem.length) return [];
  const filtros = [`sales_order_item_id.in.(${idsItem.join(",")})`];
  if (idsOp.length) filtros.push(`production_order_id.in.(${idsOp.join(",")})`);
  const { data } = await db
    .from("purchase_order_items")
    .select("id, description, quantity, need_date, suggested_supplier_id, product_id, purchase_order_id, status")
    .eq("tenant_id", tenant)
    .eq("is_suggestion", false)
    .or(filtros.join(","));
  return (data ?? []) as Array<{
    id: string;
    description: string;
    quantity: number;
    need_date: string | null;
    suggested_supplier_id: string | null;
    product_id: string | null;
    purchase_order_id: string | null;
    status: string;
  }>;
}

async function nomesFornecedores(admin: Admin, ids: string[]) {
  const m = new Map<string, string>();
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return m;
  const { data } = await asUntypedAdmin(admin).from("suppliers").select("*").in("id", u);
  for (const s of (data ?? []) as Array<Record<string, unknown>>)
    m.set(String(s.id), String(s.trade_name || s.name || s.company_name || "fornecedor").slice(0, 40));
  return m;
}

async function getHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const quem = await resolver(request, admin);
  if (quem instanceof NextResponse) return quem;
  const { tenant } = quem;
  const db = asUntypedAdmin(admin);
  const pvParam = request.nextUrl.searchParams.get("pv");

  try {
    if (!pvParam) {
      const { data: pvs } = await db
        .from("sales_orders")
        .select("order_number, client_name, expected_delivery, status, mrp_processed")
        .eq("tenant_id", tenant)
        .in("status", ["confirmed", "in_production"])
        .order("expected_delivery", { ascending: true });
      const { count } = await db
        .from("purchase_order_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant)
        .eq("is_suggestion", false)
        .eq("status", "draft")
        .is("purchase_order_id", null);
      const lista = (pvs ?? []) as Array<{ order_number: string; client_name: string | null; expected_delivery: string | null; mrp_processed: boolean | null }>;
      return apiOk({
        sem_mrp: lista.filter((p) => !p.mrp_processed).map((p) => ({ pv: p.order_number, cliente: p.client_name, entrega: p.expected_delivery })),
        requisicoes_abertas: count ?? 0,
      });
    }

    const so = await acharPv(admin, tenant, pvParam);
    if (typeof so === "string") return apiError(so, 404);
    const reqs = await calculateMaterialRequirements(admin, tenant, so.id);
    const faltas = reqs.filter((r) => r.shortage > 0.0001);
    const prodIds = [...new Set(faltas.map((f) => f.product_id))];
    const { data: prods } = prodIds.length
      ? await db.from("products").select("id, preferred_supplier_id, cost_price, technical_code").in("id", prodIds)
      : { data: [] };
    const pm = new Map(
      ((prods ?? []) as Array<{ id: string; preferred_supplier_id: string | null; cost_price: number | null; technical_code: string | null }>).map((p) => [p.id, p])
    );
    // Banco de aprendizado: item sem fornecedor preferido → usa a regra válida (6 meses) do comprador
    // antes de perguntar. A regra só diz QUEM; o pedido de compra continua indo para a fila (risco Alto).
    const aprendido = new Map<string, { fornecedor_id: string; ultimo_pc: string | null }>();
    const semPreferido = prodIds.filter((id) => !pm.get(id)?.preferred_supplier_id);
    if (semPreferido.length) {
      const { data: comp } = await db.from("agents").select("id").eq("tenant_id", tenant).eq("slug", "comprador").maybeSingle();
      if (comp?.id) {
        const { data: regras } = await db
          .from("robot_learning")
          .select("context, approved_answer")
          .eq("tenant_id", tenant)
          .eq("agent_id", comp.id)
          .gt("last_confirmed_at", limiteValidade())
          .in("context", semPreferido.map(contextoFornecedorItem));
        for (const r of (regras ?? []) as Array<{ context: string; approved_answer: Record<string, unknown> | null }>) {
          const fid = r.approved_answer?.fornecedor_id;
          if (typeof fid === "string") {
            aprendido.set(r.context.slice("fornecedor_item:".length), {
              fornecedor_id: fid,
              ultimo_pc: typeof r.approved_answer?.ultimo_pc === "string" ? (r.approved_answer.ultimo_pc as string) : null,
            });
          }
        }
      }
    }
    const abertas = await requisicoesDoPv(admin, tenant, so.id);
    const forn = await nomesFornecedores(admin, [
      ...[...pm.values()].map((p) => p.preferred_supplier_id ?? ""),
      ...[...aprendido.values()].map((a) => a.fornecedor_id),
      ...abertas.map((a) => a.suggested_supplier_id ?? ""),
    ]);
    const grupos = new Map<string, { fornecedor: string; itens: unknown[]; custo_estimado: number }>();
    for (const f of faltas) {
      const p = pm.get(f.product_id);
      const regra = aprendido.get(f.product_id);
      const fid = p?.preferred_supplier_id ?? regra?.fornecedor_id ?? "";
      const g = grupos.get(fid) ?? { fornecedor: forn.get(fid) ?? "sem fornecedor preferido", itens: [], custo_estimado: 0 };
      const custo = Number(p?.cost_price ?? 0);
      g.itens.push({
        codigo: p?.technical_code ?? null,
        descricao: f.description,
        falta: Math.round(f.shortage * 1000) / 1000,
        unidade: f.unit,
        necessario: f.needed,
        estoque: f.quantity_on_hand,
        a_caminho: f.quantity_incoming,
        custo_unit: custo || null,
        fornecedor_por: p?.preferred_supplier_id ? "cadastro" : regra ? `banco_de_aprendizado (último ${regra.ultimo_pc ?? "PC"})` : "perguntar",
      });
      g.custo_estimado += custo * f.shortage;
      grupos.set(fid, g);
    }
    return apiOk({
      pv: so.order_number,
      cliente: so.client_name,
      entrega: so.expected_delivery,
      mrp_rodado: !!so.mrp_processed,
      tem_falta: faltas.length > 0,
      comprar: [...grupos.entries()].map(([fornecedor_id, g]) => ({
        fornecedor_id: fornecedor_id || null,
        ...g,
        custo_estimado: Math.round(g.custo_estimado * 100) / 100,
      })),
      requisicoes: abertas.map((a) => ({
        id: a.id,
        descricao: a.description,
        quantidade: a.quantity,
        precisa_em: a.need_date,
        fornecedor: a.suggested_supplier_id ? forn.get(a.suggested_supplier_id) ?? null : null,
        fornecedor_id: a.suggested_supplier_id,
        em_pc: !!a.purchase_order_id,
        status: a.status,
      })),
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no comprador.", 500);
  }
}

async function postHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const quem = await resolver(request, admin);
  if (quem instanceof NextResponse) return quem;
  const { tenant, userId } = quem;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(b.acao ?? "");

  try {
    if (acao === "planejar") {
      const so = await acharPv(admin, tenant, String(b.pv ?? ""));
      if (typeof so === "string") return apiError(so, 404);
      if (so.mrp_processed) return apiError(`${so.order_number} já foi planejado (MRP rodado).`, 400);
      const r = await processMrpForSalesOrder(admin, tenant, userId, so.id, true, { createTracePurchaseOrders: true });
      const abertas = await requisicoesDoPv(admin, tenant, so.id);
      return apiOk({
        planejado: true,
        pv: so.order_number,
        linhas: r.lines.length,
        requisicoes: abertas.filter((a) => !a.purchase_order_id).length,
      });
    }

    if (acao === "emitir_pc") {
      const trava = await travaEfeitoExternoDoRobo(request, tenant, "comprador.emitir_pc");
      if (trava) return trava;
      const ids = Array.isArray(b.requisicoes) ? b.requisicoes.filter((x): x is string => typeof x === "string") : [];
      if (!ids.length) return apiError("Informe requisicoes (ids).", 400);
      const fornecedor = typeof b.fornecedor_id === "string" && b.fornecedor_id.trim() ? b.fornecedor_id.trim() : null;
      // Fase 5: robô só emite PC com pedido APROVADO pelo diretor (mesmo fornecedor e mesmas requisições).
      const db = asUntypedAdmin(admin);
      const { data: forn } = fornecedor
        ? await db.from("suppliers").select("name").eq("id", fornecedor).eq("tenant_id", tenant).maybeSingle()
        : { data: null };
      const chave = `pc:${fornecedor ?? "sem-fornecedor"}:${[...ids].sort().join(",")}`.slice(0, 120);
      const aprov = await exigirAprovacao(request, tenant, "comprador", b.aprovacao_id, {
        acao: "compra.pedido",
        chave,
        resumo: `Pedido de compra para ${(forn?.name as string) ?? "fornecedor a definir"} — ${ids.length} requisição(ões)${b.pv ? ` do ${String(b.pv)}` : ""}`,
        dados: { fornecedor_id: fornecedor, fornecedor: (forn?.name as string) ?? null, requisicoes: ids, pv: b.pv ?? null },
      });
      if (!aprov.ok) return aprov.response;
      const r = await issueRequisitionsAsPurchaseOrder(admin, tenant, userId, ids, { supplier_id: fornecedor });
      return apiOk({ emitido: true, resultado: r });
    }

    if (acao === "fornecedor_preferido") {
      const itens = Array.isArray(b.itens) ? (b.itens as Array<{ produto_id?: string; fornecedor_id?: string }>) : [];
      const db = asUntypedAdmin(admin);
      const out: string[] = [];
      for (const it of itens) {
        if (!it.produto_id || !it.fornecedor_id) continue;
        const { error } = await db
          .from("products")
          .update({ preferred_supplier_id: it.fornecedor_id })
          .eq("id", it.produto_id)
          .eq("tenant_id", tenant);
        out.push(`${it.produto_id.slice(0, 8)} ${error ? "ERRO " + error.message : "ok"}`);
      }
      return apiOk({ atualizados: out.filter((x) => x.endsWith("ok")).length, detalhes: out });
    }

    return apiError('acao deve ser "planejar", "emitir_pc" ou "fornecedor_preferido".', 400);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no comprador.", 500);
  }
}

export const GET = comLogDoRobo("comprador", "comprador", getHandler);
export const POST = comLogDoRobo("comprador", "comprador", postHandler);
