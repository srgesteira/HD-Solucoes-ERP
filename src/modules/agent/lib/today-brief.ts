import "server-only";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { computeCashFlowProjection } from "@/modules/finance/lib/cash-flow-projection";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const brl = (n: unknown) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const dm = (iso: unknown) => {
  const s = String(iso ?? "").slice(0, 10);
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "-";
};
const short = (name: unknown) =>
  String(name ?? "?")
    .replace(/\b(LTDA\.?|S\.?A\.?|EIRELI|ME|EPP|COMERCIO|IMPORTACAO|EXPORTACAO|E|DE|DO|DA|DOS|DAS)\b\.?/gi, " ")
    .replace(/[,.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Resumo do dia em texto curto: cada bloco vira uma linha "ok" quando não há nada a fazer,
 * e lista só os itens que pedem ação. Uma chamada substitui ~10 consultas.
 */
export async function buildTodayBrief(admin: Admin, tenantId: string): Promise<string> {
  const db = asUntypedAdmin(admin);
  const today = todayIsoSaoPaulo();
  const tomorrow = addDays(today, 1);
  const in3 = addDays(today, 3);

  const [proj, recs, pays, sos, pos, crm, pendCost] = await Promise.all([
    computeCashFlowProjection(admin, tenantId, 120).catch(() => null),
    db
      .from("receivables")
      .select("client_name, document_number, current_amount, due_date, status, is_forecast")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "partial", "overdue"])
      .eq("is_forecast", false)
      .lte("due_date", tomorrow)
      .order("due_date"),
    db
      .from("accounts_payable")
      .select("description, current_amount, due_date, status, is_forecast")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "overdue"])
      .eq("is_forecast", false)
      .lte("due_date", tomorrow)
      .order("due_date"),
    db
      .from("sales_orders")
      .select("order_number, client_name, expected_delivery, status, total")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "confirmed", "in_production"])
      .lte("expected_delivery", in3)
      .order("expected_delivery"),
    db
      .from("purchase_orders")
      .select("po_number, status, total, order_date, expected_delivery, updated_at, supplier:suppliers(name)")
      .eq("tenant_id", tenantId)
      .in("status", ["sent", "confirmed", "partial"])
      .order("expected_delivery"),
    db.rpc("fn_crm_today", { p_tenant: tenantId }),
    db
      .from("purchase_order_items")
      .select("id, description, total_price, cost_center_id, cost_nature_id, purchase_orders!inner(po_number, order_date, status)")
      .eq("tenant_id", tenantId)
      .gte("purchase_orders.order_date", "2026-11-01")
      .neq("purchase_orders.status", "cancelled")
      .is("cost_center_id", null)
      .limit(50),
  ]);

  const L: string[] = [`RESUMO ${dm(today)} (só o que pede ação)`];

  // ---- CAIXA
  if (proj) {
    const s = proj.series;
    const in7 = s.slice(0, 7).reduce((a, p) => a + p.inflow, 0);
    const out7 = s.slice(0, 7).reduce((a, p) => a + p.outflow, 0);
    const byMonth = new Map<string, number>();
    for (const p of s) byMonth.set(p.date.slice(0, 7), p.cumulative);
    const neg = [...byMonth.entries()].find(([, v]) => v < 0);
    const opening = proj.summary.opening_balance ?? 0;
    L.push(
      "",
      `CAIXA 7d: entra ${brl(in7)} · sai ${brl(out7)}` +
        (neg ? ` · ⚠ 1º mês negativo ${MONTHS[Number(neg[0].slice(5)) - 1]}/${neg[0].slice(2, 4)} (${brl(neg[1])})` : " · meses ok") +
        (opening === 0 ? " · saldo inicial NÃO informado" : "")
    );
  }

  // ---- CONTAS vencidas / hoje / amanhã (reais)
  type T = { current_amount: number; due_date: string; client_name?: string; document_number?: string; description?: string };
  const r = (recs.data ?? []) as T[];
  const p = (pays.data ?? []) as T[];
  const tag = (d: string) => (d < today ? "VENCIDO" : d === today ? "hoje" : "amanhã");
  if (!r.length && !p.length) L.push("CONTAS: nada vencido, hoje ou amanhã");
  for (const x of r) L.push(`RECEBER ${tag(x.due_date)} ${dm(x.due_date)} ${short(x.client_name)} ${x.document_number ?? ""} R$${brl(x.current_amount)}`);
  for (const x of p) L.push(`PAGAR ${tag(x.due_date)} ${dm(x.due_date)} ${String(x.description).slice(0, 45)} R$${brl(x.current_amount)}`);

  // ---- VENDAS: atrasados e entregas em 3 dias
  type SO = { order_number: string; client_name: string; expected_delivery: string; status: string; total: number };
  const so = (sos.data ?? []) as SO[];
  if (!so.length) L.push("PV: nada atrasado nem entregando em 3 dias");
  for (const x of so) {
    const late = x.expected_delivery < today;
    L.push(`PV ${late ? "ATRASADO" : "entrega"} ${dm(x.expected_delivery)} ${x.order_number.slice(-4)} ${short(x.client_name)} ${x.status}`);
  }

  // ---- COMPRAS: chegando em 3 dias, atrasadas, enviadas sem confirmação
  type PO = { po_number: string; status: string; total: number; expected_delivery: string | null; updated_at: string; supplier: { name: string } | null };
  const po = (pos.data ?? []) as PO[];
  const poLines: string[] = [];
  for (const x of po) {
    const sup = short(x.supplier?.name);
    if (x.status === "sent" && x.updated_at.slice(0, 10) <= addDays(today, -2)) {
      poLines.push(`PC ${x.po_number} enviado sem confirmação ${sup} — pedir confirmação (fora da previsão de caixa)`);
    } else if (x.expected_delivery && x.expected_delivery < today) {
      poLines.push(`PC ${x.po_number} ATRASADO ${dm(x.expected_delivery)} ${sup}`);
    } else if (x.expected_delivery && x.expected_delivery <= in3) {
      poLines.push(`PC ${x.po_number} chega ${dm(x.expected_delivery)} ${sup} — dar entrada ao chegar`);
    }
  }
  L.push(...(poLines.length ? poLines : ["PC: nada chegando nem atrasado"]));

  // ---- CRM
  const c = (crm.data ?? {}) as {
    contatos_hoje?: { cliente: string; acao: string | null }[];
    tarefas?: { cliente: string | null; resumo: string }[];
    oportunidades_paradas?: { cliente: string; valor: number | null; dias_sem_contato: number; titulo: string }[];
  };
  const ch = c.contatos_hoje ?? [];
  const tasks = c.tarefas ?? [];
  const stale = [...(c.oportunidades_paradas ?? [])].sort((a, b) => Number(b.valor ?? 0) - Number(a.valor ?? 0));
  L.push("", `CRM: ${ch.length} contato(s) hoje · ${tasks.length} tarefa(s) · ${stale.length} proposta(s) parada(s) 7d+`);
  for (const x of ch.slice(0, 15)) L.push(`  contato ${short(x.cliente)} — ${String(x.acao ?? "").slice(0, 60)}`);
  for (const x of tasks.slice(0, 10)) L.push(`  tarefa ${short(x.cliente)} — ${x.resumo.slice(0, 60)}`);
  for (const x of stale.slice(0, 8)) L.push(`  parada ${x.dias_sem_contato}d ${short(x.cliente)} ${x.titulo.slice(-12)} R$${brl(x.valor)}`);

  // ---- CUSTOS a classificar (exclui MP/embalagem de estoque)
  type CI = { description: string | null; total_price: number; cost_nature_id: string | null; purchase_orders: { po_number: string } };
  const { data: natStock } = await db.from("cost_natures").select("id").eq("tenant_id", tenantId).in("code", ["MP", "EMB"]);
  const stock = new Set(((natStock ?? []) as { id: string }[]).map((n) => n.id));
  const pend = ((pendCost.data ?? []) as CI[]).filter((x) => !(x.cost_nature_id && stock.has(x.cost_nature_id)));
  L.push(pend.length ? `CUSTOS a classificar: ${pend.length}` : "CUSTOS: nada a classificar");
  for (const x of pend.slice(0, 10)) L.push(`  PC ${x.purchase_orders.po_number} ${String(x.description).slice(0, 40)} R$${brl(x.total_price)}`);

  return L.join("\n");
}
