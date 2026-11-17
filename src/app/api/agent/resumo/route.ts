import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { buildTodayBrief } from "@/modules/agent/lib/today-brief";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/resumo            → retrato completo (listas)
 * GET /api/agent/resumo?modo=hoje   → só exceções e ações do dia (usar nas rotinas)
 * Retrato compacto (texto puro) da empresa para o assistente (Claude):
 * orçamentos em aberto, contas a receber/pagar e pedidos de compra.
 * Pensado para gastar o mínimo de tokens — uma chamada substitui várias
 * consultas e telas. Só leitura.
 *
 * Autorização: sessão com acesso financeiro/relatórios, OU header
 * `Authorization: Bearer <AGENT_API_KEY>` (quando a env existir).
 */
function isAgentKey(request: NextRequest): boolean {
  const key = process.env.AGENT_API_KEY;
  if (!key) return false;
  return request.headers.get("authorization") === `Bearer ${key}`;
}

const brl = (n: unknown) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
const daysSince = (iso: unknown) =>
  Math.floor((Date.now() - new Date(String(iso)).getTime()) / 86_400_000);

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  let tenantId: string | null = null;

  if (isAgentKey(request)) {
    const { data } = await admin.from("tenants").select("id").limit(1);
    tenantId = data?.[0]?.id ?? null;
  } else {
    const gate = await assertFinanceOrReportsAccess();
    if (!gate.ok) return gate.response;
    tenantId = await getCurrentTenantId();
  }
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  // ?modo=hoje → só o que pede ação hoje (economiza tokens nas rotinas diárias)
  const modo = request.nextUrl.searchParams.get("modo");
  if (modo === "carteira" || modo === "followup") {
    try {
      const [qs, pvs] = await Promise.all([
        admin
          .from("quotes")
          .select("quote_number, client_name, total, status, updated_at, send_count, quote_date, notes")
          .eq("tenant_id", tenantId)
          .in("status", ["draft", "sent", "approved", "revision"])
          .is("converted_to_sale_id", null)
          .order("quote_date", { ascending: true }),
        admin
          .from("sales_orders")
          .select("order_number, client_name, total, status, expected_delivery, pcp_reply_comercial_observation")
          .eq("tenant_id", tenantId)
          .in("status", ["confirmed", "in_production", "shipped"])
          .order("expected_delivery", { ascending: true }),
      ]);
      if (qs.error || pvs.error) throw new Error((qs.error || pvs.error)!.message);
      const hoje = new Date().toISOString().slice(0, 10);
      const L: string[] = [];
      const linhaDe = (notes: unknown, chave: string) =>
        String(notes ?? "")
          .split("\n")
          .map((s) => s.trim())
          .find((s) => s.toLowerCase().startsWith(chave))
          ?.slice(chave.length)
          .replace(/^[:\s]+/, "") ?? "";
      if (modo === "followup") {
        const enviados = (qs.data ?? []).filter((x) => x.status !== "draft");
        L.push(`FOLLOW-UP — ${enviados.length} orçamento(s) enviados · R$ ${brl(enviados.reduce((s, x) => s + Number(x.total ?? 0), 0))}`);
        const { data: opps } = await asUntypedAdmin(admin)
          .from("crm_opportunities")
          .select("quote_id, next_action, next_action_at, quote:quotes(quote_number)")
          .eq("tenant_id", tenantId)
          .not("quote_id", "is", null);
        const porOrc = new Map(
          ((opps ?? []) as unknown as Array<{ next_action: string | null; next_action_at: string | null; quote: { quote_number: string } | null }>).map((o) => [o.quote?.quote_number ?? "", o])
        );
        for (const x of [...enviados].sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))) {
          const o = porOrc.get(x.quote_number);
          const quando = o?.next_action_at ? `retomar ${o.next_action_at.slice(8, 10)}/${o.next_action_at.slice(5, 7)}${o.next_action_at <= hoje ? " ⚠ HOJE" : ""}` : "sem data de retorno";
          L.push(`  ${x.quote_number} ${short(x.client_name)} R$${brl(x.total)} · parado ${daysSince(x.updated_at)}d · ${quando}`);
          if (o?.next_action) L.push(`    ${String(o.next_action).slice(0, 140)}`);
        }
      } else {
        const aResponder = (qs.data ?? []).filter((x) => x.status === "draft");
        const { data: semOrc } = await asUntypedAdmin(admin)
          .from("crm_opportunities")
          .select("title, next_action, next_action_at, created_at, customer:customers(name, trade_name)")
          .eq("tenant_id", tenantId)
          .is("quote_id", null)
          .in("stage", ["novo", "qualificado"])
          .order("created_at", { ascending: true });
        const pend = (semOrc ?? []) as unknown as Array<{ title: string; next_action: string | null; next_action_at: string | null; created_at: string; customer: { name: string; trade_name: string | null } | null }>;
        L.push(`ORÇAMENTOS A RESPONDER ${aResponder.length + pend.length}`);
        for (const o of pend) {
          const pr = o.next_action_at ? ` · prometido ${o.next_action_at.slice(8, 10)}/${o.next_action_at.slice(5, 7)}${o.next_action_at < hoje ? " ⚠ VENCIDO" : ""}` : "";
          L.push(`  (sem orçamento no ERP) ${short(o.customer?.trade_name || o.customer?.name)} — ${o.title} · pedido há ${daysSince(o.created_at)}d${pr}`);
          L.push(`    ${String(o.next_action ?? "Falta: definir com o Helder").slice(0, 160)}`);
        }
        for (const x of aResponder) {
          const falta = linhaDe(x.notes, "falta") || "não registrado (perguntar ao Helder)";
          const prometido = linhaDe(x.notes, "prometido");
          L.push(`  ${x.quote_number} ${short(x.client_name)} · pedido há ${daysSince(x.quote_date ?? x.updated_at)}d${prometido ? ` · prometido ${prometido}` : ""}`);
          L.push(`    falta: ${falta}`);
        }
        const ab = pvs.data ?? [];
        L.push(`PEDIDOS ABERTOS ${ab.length} · R$ ${brl(ab.reduce((s, x) => s + Number(x.total ?? 0), 0))}`);
        for (const x of ab) {
          const etapa = /etapa=(\w+)/.exec(String(x.pcp_reply_comercial_observation ?? ""))?.[1] ?? (x.status === "shipped" ? "expedido" : "sem plano");
          const atraso = x.expected_delivery && x.expected_delivery < hoje && x.status !== "shipped" ? " ⚠ ATRASADO" : "";
          const ent = x.expected_delivery ? `${x.expected_delivery.slice(8, 10)}/${x.expected_delivery.slice(5, 7)}` : "?";
          L.push(`  ${x.order_number} ${short(x.client_name)} R$${brl(x.total)} · entrega ${ent} · ${etapa}${atraso}`);
        }
        const enviados = (qs.data ?? []).filter((x) => x.status !== "draft");
        L.push(`(follow-up: ${enviados.length} orçamentos enviados aguardando — ver modo=followup)`);
      }
      return new NextResponse(L.join("\n"), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch (e) {
      return apiError("Erro na carteira: " + (e instanceof Error ? e.message : String(e)), 500);
    }
  }

  if (request.nextUrl.searchParams.get("modo") === "hoje") {
    try {
      const text = await buildTodayBrief(admin, tenantId);
      return new NextResponse(text, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch (e) {
      return apiError("Erro no resumo do dia: " + (e instanceof Error ? e.message : String(e)), 500);
    }
  }

  const [quotes, recs, pays, pos] = await Promise.all([
    admin
      .from("quotes")
      .select("quote_number, client_name, total, status, updated_at, send_count")
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "sent", "approved", "revision"])
      .is("converted_to_sale_id", null)
      .order("updated_at", { ascending: true }),
    admin
      .from("receivables")
      .select("client_name, document_number, current_amount, due_date, status, is_forecast")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "partial", "overdue"])
      .order("due_date", { ascending: true }),
    admin
      .from("accounts_payable")
      .select("description, current_amount, due_date, status, is_forecast")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "overdue"])
      .order("due_date", { ascending: true }),
    admin
      .from("purchase_orders")
      .select("po_number, status, total, order_date, expected_delivery, supplier:suppliers(name)")
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "confirmed", "partial"])
      .order("order_date", { ascending: true }),
  ]);

  const err = quotes.error || recs.error || pays.error || pos.error;
  if (err) return apiError("Erro no resumo: " + err.message, 500);

  const lines: string[] = [];
  const q = quotes.data ?? [];
  const qOpen = q.filter((x) => x.status !== "draft");
  lines.push(
    `ORÇAMENTOS ABERTOS ${qOpen.length} · R$ ${brl(qOpen.reduce((s, x) => s + Number(x.total ?? 0), 0))}`
  );
  for (const x of q) {
    lines.push(
      `${String(x.quote_number).slice(-3)} ${x.status} ${short(x.client_name)} R$${brl(x.total)} ${daysSince(x.updated_at)}d env${x.send_count ?? 0}`
    );
  }

  const section = (
    title: string,
    rows: { current_amount: unknown }[],
    fmt: (x: never) => string
  ) => {
    lines.push("", `${title} ${rows.length} · R$ ${brl(rows.reduce((s, x) => s + Number(x.current_amount ?? 0), 0))}`);
    for (const x of rows) lines.push(fmt(x as never));
  };
  type Rec = { client_name: string | null; document_number: string | null; current_amount: number; due_date: string; status: string; is_forecast: boolean | null };
  type Pay = { description: string; current_amount: number; due_date: string; status: string; is_forecast: boolean | null };
  const recFmt = (x: Rec) => `${dm(x.due_date)} ${x.status} ${short(x.client_name)} ${x.document_number ?? ""} R$${brl(x.current_amount)}`;
  const payFmt = (x: Pay) => `${dm(x.due_date)} ${x.status} ${String(x.description).slice(0, 50)} R$${brl(x.current_amount)}`;
  const r = (recs.data ?? []) as Rec[];
  const p = (pays.data ?? []) as Pay[];
  section("A RECEBER (real)", r.filter((x) => !x.is_forecast), recFmt);
  section("A PAGAR (real)", p.filter((x) => !x.is_forecast), payFmt);
  section("PREVISTO A RECEBER (pedido de venda ainda não faturado)", r.filter((x) => x.is_forecast), recFmt);
  section("PREVISTO A PAGAR (pedido de compra ainda não recebido)", p.filter((x) => x.is_forecast), payFmt);

  const o = pos.data ?? [];
  lines.push("", `PEDIDOS DE COMPRA ABERTOS ${o.length}`);
  for (const x of o) {
    const sup = (x.supplier as { name: string | null } | null)?.name;
    lines.push(
      `PC${x.po_number} ${x.status} ${short(sup)} R$${brl(x.total)} pedido ${dm(x.order_date)} entrega ${dm(x.expected_delivery)}`
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
