import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/resumo
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
