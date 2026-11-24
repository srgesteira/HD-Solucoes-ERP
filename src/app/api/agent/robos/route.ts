import { comLogDoRobo } from "@/modules/agent/lib/governance";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import {
  buildPayableMovementDescription,
  buildReceivableMovementDescription,
} from "@/modules/finance/lib/financial-movements";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/agent/robos — rotas dos robôs do n8n (Cobrador, Financeiro).
 * Autorização: Bearer AGENT_API_KEY, ou sessão de administrador (para testes).
 *
 * GET  ?acao=pagar-hoje
 *   → contas a pagar reais (sem previsão) em aberto com vencimento até hoje.
 *
 * POST { acao: "conciliar", conta?: "C6", dry_run?: boolean,
 *        linhas: [{ data: "AAAA-MM-DD", valor: -123.45, descricao: "PIX ..." }] }
 *   → valor negativo = saída (procura conta a pagar), positivo = entrada (conta a receber).
 *   → só dá baixa quando existe UM único título em aberto com o mesmo valor
 *     (diferença < R$ 0,01) e vencimento entre 10 dias antes e 5 dias depois da data.
 *   → devolve { baixados, sem_par, ambiguos }. Nada é criado; o que não bate fica para o Claude.
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

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const money = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

async function getHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;

  const acao = request.nextUrl.searchParams.get("acao");
  if (acao !== "pagar-hoje") return apiError("acao inválida (use pagar-hoje)", 400);

  const today = todayIsoSaoPaulo();
  const { data, error } = await admin
    .from("accounts_payable")
    .select("id, description, current_amount, due_date, status")
    .eq("tenant_id", tenant)
    .eq("is_forecast", false)
    .in("status", ["pending", "overdue"])
    .lte("due_date", today)
    .order("due_date", { ascending: true });
  if (error) return apiError("Erro ao ler contas a pagar: " + error.message, 500);

  // Boletos que o Helder combinou de emitir até hoje (nota "Boleto: emitir em AAAA-MM-DD" na conta a receber).
  const { data: recs } = await admin
    .from("receivables")
    .select("id, client_name, description, current_amount, due_date, notes")
    .eq("tenant_id", tenant)
    .eq("is_forecast", false)
    .in("status", ["pending", "partial", "overdue"])
    .ilike("notes", "%Boleto: emitir em%");
  const boletos = (recs ?? [])
    .map((r) => ({ r, quando: /Boleto: emitir em (\d{4}-\d{2}-\d{2})/.exec(String(r.notes ?? ""))?.[1] ?? "" }))
    .filter((x) => x.quando && x.quando <= today)
    .map(({ r, quando }) => ({
      id: r.id,
      cliente: r.client_name,
      descricao: r.description,
      valor: money(r.current_amount),
      vencimento: r.due_date,
      emitir_em: quando,
    }));

  return apiOk({
    hoje: today,
    boletos,
    itens: (data ?? []).map((p) => ({
      id: p.id,
      descricao: p.description,
      valor: money(p.current_amount),
      vencimento: p.due_date,
      atrasado: String(p.due_date) < today,
    })),
  });
}

type Linha = { data: string; valor: number; descricao?: string };

async function postHandler(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const tenant = await resolveTenant(request, admin);
  if (typeof tenant !== "string") return tenant;

  let body: { acao?: string; conta?: string; dry_run?: boolean; linhas?: Linha[] };
  try {
    body = await request.json();
  } catch {
    return apiError("JSON inválido", 400);
  }
  if (body.acao === "boleto") {
    // { acao:"boleto", pv:"PV-2026-0011" | "11", emitir_em?: "AAAA-MM-DD", emitido?: true }
    const b = body as unknown as { pv?: string; emitir_em?: string; emitido?: boolean };
    const num = String(b.pv ?? "").match(/(\d+)\D*$/)?.[1] ?? "";
    if (!num) return apiError("Informe pv.", 400);
    const { data: sos } = await admin.from("sales_orders").select("id, order_number").eq("tenant_id", tenant).ilike("order_number", `%${num.replace(/^0+/, "") || "0"}`);
    const so = (sos ?? []).find((s) => Number(String(s.order_number).split("-").pop()) === Number(num));
    if (!so) return apiError(`PV ${b.pv} não encontrado.`, 404);
    const { data: recs, error: er } = await admin
      .from("receivables")
      .select("id, notes")
      .eq("tenant_id", tenant)
      .eq("sales_order_id", so.id)
      .eq("is_forecast", false)
      .in("status", ["pending", "partial", "overdue"]);
    if (er) return apiError(er.message, 500);
    const hoje = todayIsoSaoPaulo();
    const linha = b.emitido
      ? `Boleto: emitido em ${hoje}`
      : /^\d{4}-\d{2}-\d{2}$/.test(String(b.emitir_em ?? ""))
        ? `Boleto: emitir em ${b.emitir_em}`
        : null;
    if (!linha) return apiError("Informe emitir_em (AAAA-MM-DD) ou emitido:true.", 400);
    for (const r of recs ?? []) {
      const base = String(r.notes ?? "")
        .split("\n")
        .filter((l) => !/^Boleto: /.test(l.trim()))
        .join("\n")
        .trim();
      await admin.from("receivables").update({ notes: (base ? base + "\n" : "") + linha }).eq("id", r.id).eq("tenant_id", tenant);
    }
    return apiOk({ pv: so.order_number, parcelas: (recs ?? []).length, nota: linha });
  }

  if (body.acao !== "conciliar") return apiError("acao inválida (use conciliar ou boleto)", 400);
  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (!linhas.length) return apiError("linhas vazias", 400);
  if (linhas.length > 500) return apiError("no máximo 500 linhas por vez", 400);

  const dry = body.dry_run === true;
  const conta = String(body.conta ?? "").slice(0, 20);
  const rpc = asUntypedAdmin(admin);

  const baixados: unknown[] = [];
  const sem_par: unknown[] = [];
  const ambiguos: unknown[] = [];
  const usados = new Set<string>();
  const ja_conciliados: unknown[] = [];

  // Movimentos já lançados no ERP no período do extrato (para não perguntar de novo o que já foi baixado).
  const datas = linhas.map((l) => String(l?.data ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  type Mov = { id: string; direction: string; amount: number; movement_date: string; description: string };
  let movs: Mov[] = [];
  if (datas.length) {
    const { data: mv } = await rpc
      .from("financial_movements")
      .select("id, direction, amount, movement_date, description")
      .eq("tenant_id", tenant)
      .gte("movement_date", addDays(datas[0], -5))
      .lte("movement_date", addDays(datas[datas.length - 1], 5));
    movs = (mv ?? []) as Mov[];
  }
  const movUsados = new Set<string>();
  const dist = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const jaLancado = (data: string, valor: number): string | null => {
    const dir = valor < 0 ? "out" : "in";
    const abs = Math.abs(valor);
    const um = movs
      .filter((m) => !movUsados.has(m.id) && m.direction === dir && Math.abs(money(m.amount) - abs) < 0.01 && dist(m.movement_date, data) <= 5)
      .sort((a, b) => dist(a.movement_date, data) - dist(b.movement_date, data))[0];
    if (um) {
      movUsados.add(um.id);
      return um.description;
    }
    // Boletos/créditos do mesmo dia somados num lançamento só do banco.
    for (const delta of [0, 1, -1]) {
      const dia = addDays(data, delta);
      const doDia = movs.filter((m) => !movUsados.has(m.id) && m.direction === dir && m.movement_date === dia);
      if (doDia.length > 1 && Math.abs(money(doDia.reduce((s, m) => s + Number(m.amount), 0)) - abs) < 0.01) {
        doDia.forEach((m) => movUsados.add(m.id));
        return doDia.map((m) => m.description).join(" + ").slice(0, 200);
      }
    }
    return null;
  };

  for (const l of linhas) {
    const data = String(l?.data ?? "").slice(0, 10);
    const valor = money(l?.valor);
    const descricao = String(l?.descricao ?? "").slice(0, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !valor) {
      sem_par.push({ data, valor, descricao, motivo: "linha inválida" });
      continue;
    }
    const abs = Math.abs(valor);
    const de = addDays(data, -10);
    const ate = addDays(data, 5);

    if (valor < 0) {
      const { data: cands, error } = await admin
        .from("accounts_payable")
        .select("id, description, current_amount, due_date, purchase_order_id")
        .eq("tenant_id", tenant)
        .eq("is_forecast", false)
        .in("status", ["pending", "overdue"])
        .gte("due_date", de)
        .lte("due_date", ate);
      if (error) return apiError("Erro ao ler contas a pagar: " + error.message, 500);
      const iguais = (cands ?? []).filter(
        (c) => !usados.has(c.id) && Math.abs(money(c.current_amount) - abs) < 0.01
      );
      if (iguais.length === 0) {
        const ja = jaLancado(data, valor);
        if (ja) ja_conciliados.push({ data, valor, descricao, no_erp: ja });
        else sem_par.push({ data, valor, descricao });
        continue;
      }
      if (iguais.length > 1) {
        ambiguos.push({ data, valor, descricao, titulos: iguais.map((c) => c.description) });
        continue;
      }
      const t = iguais[0];
      usados.add(t.id);
      if (!dry) {
        const { error: e } = await rpc.rpc("fn_settle_payable", {
          p_tenant_id: tenant,
          p_payable_id: t.id,
          p_amount: abs,
          p_payment_date: data,
          p_description: buildPayableMovementDescription(String(t.description ?? "")),
          p_reference_id: t.purchase_order_id,
          p_created_by: null,
        });
        if (e) {
          sem_par.push({ data, valor, descricao, motivo: "erro na baixa: " + e.message });
          continue;
        }
        await admin
          .from("accounts_payable")
          .update({ payment_date: data })
          .eq("id", t.id)
          .eq("tenant_id", tenant)
          .eq("status", "paid");
      }
      baixados.push({ tipo: "pagar", data, valor, extrato: descricao, titulo: t.description, conta });
    } else {
      const { data: cands, error } = await admin
        .from("receivables")
        .select("id, description, client_name, current_amount, paid_amount, due_date, sales_order_id")
        .eq("tenant_id", tenant)
        .eq("is_forecast", false)
        .in("status", ["pending", "partial", "overdue"])
        .gte("due_date", de)
        .lte("due_date", ate);
      if (error) return apiError("Erro ao ler contas a receber: " + error.message, 500);
      const iguais = (cands ?? []).filter(
        (c) =>
          !usados.has(c.id) &&
          Math.abs(money(Number(c.current_amount ?? 0) - Number(c.paid_amount ?? 0)) - abs) < 0.01
      );
      if (iguais.length === 0) {
        const ja = jaLancado(data, valor);
        if (ja) ja_conciliados.push({ data, valor, descricao, no_erp: ja });
        else sem_par.push({ data, valor, descricao });
        continue;
      }
      if (iguais.length > 1) {
        ambiguos.push({
          data,
          valor,
          descricao,
          titulos: iguais.map((c) => `${c.client_name ?? ""} ${c.description ?? ""}`.trim()),
        });
        continue;
      }
      const t = iguais[0];
      usados.add(t.id);
      if (!dry) {
        const { error: e } = await rpc.rpc("fn_settle_receivable", {
          p_tenant_id: tenant,
          p_receivable_id: t.id,
          p_amount: abs,
          p_interest_adjustment: 0,
          p_discount_adjustment: 0,
          p_payment_date: data,
          p_description: buildReceivableMovementDescription(t.description, t.client_name),
          p_reference_id: t.sales_order_id,
          p_created_by: null,
        });
        if (e) {
          sem_par.push({ data, valor, descricao, motivo: "erro na baixa: " + e.message });
          continue;
        }
      }
      baixados.push({
        tipo: "receber",
        data,
        valor,
        extrato: descricao,
        titulo: `${t.client_name ?? ""} ${t.description ?? ""}`.trim(),
        conta,
      });
    }
  }

  return apiOk({ dry_run: dry, baixados, sem_par, ambiguos, ja_conciliados });
}

export const GET = comLogDoRobo("robos", (r) => (r.method === "GET" ? "cobrador" : "financeiro"), getHandler);
export const POST = comLogDoRobo("robos", (r) => (r.method === "GET" ? "cobrador" : "financeiro"), postHandler);
