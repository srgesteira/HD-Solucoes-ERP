import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * GET /api/reports/cash-flow?horizon=90
 * Projeção: entradas (receivables por vencimento) vs saídas (AP por due_date + PCs confirmados sem AP).
 */
export async function GET(request: NextRequest) {
  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const horizon = Math.min(
    120,
    Math.max(30, parseInt(request.nextUrl.searchParams.get("horizon") ?? "90", 10) || 90)
  );

  const admin = createSupabaseAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + horizon);

  const { data: receivables, error: rErr } = await admin
    .from("receivables")
    .select("id, due_date, current_amount, status, client_name")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial"])
    .eq("is_forecast", false);

  if (rErr) {
    return apiError("Recebíveis: " + rErr.message, 500);
  }

  const { data: payables, error: apErr } = await admin
    .from("accounts_payable")
    .select("id, due_date, current_amount, status")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial"]);

  if (apErr) {
    return apiError("Contas a pagar: " + apErr.message, 500);
  }

  const { data: pos, error: pErr } = await admin
    .from("purchase_orders")
    .select("id, total, status, expected_delivery, order_date, po_number")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("status", "confirmed");

  if (pErr) {
    return apiError("Compras: " + pErr.message, 500);
  }

  const inByDay = new Map<string, number>();
  for (const r of receivables ?? []) {
    const k = dayKey(r.due_date);
    if (!k) continue;
    const amt = Number(r.current_amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    inByDay.set(k, (inByDay.get(k) ?? 0) + amt);
  }

  const outByDay = new Map<string, number>();
  const poIdsWithAp = new Set<string>();

  for (const ap of payables ?? []) {
    const k = dayKey(ap.due_date);
    if (!k) continue;
    const amt = Number(ap.current_amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    outByDay.set(k, (outByDay.get(k) ?? 0) + amt);
  }

  const { data: apPoLinks } = await admin
    .from("accounts_payable")
    .select("purchase_order_id")
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null);

  for (const row of apPoLinks ?? []) {
    if (row.purchase_order_id) poIdsWithAp.add(row.purchase_order_id);
  }

  for (const p of pos ?? []) {
    if (poIdsWithAp.has(p.id)) continue;
    const k =
      dayKey(p.expected_delivery) ?? dayKey(p.order_date);
    if (!k) continue;
    const amt = Number(p.total ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    outByDay.set(k, (outByDay.get(k) ?? 0) + amt);
  }

  const series: Array<{
    date: string;
    inflow: number;
    outflow: number;
    net: number;
    cumulative: number;
  }> = [];

  let cumulative = 0;
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const inf = inByDay.get(key) ?? 0;
    const outf = outByDay.get(key) ?? 0;
    const net = inf - outf;
    cumulative += net;
    series.push({
      date: key,
      inflow: Math.round(inf * 100) / 100,
      outflow: Math.round(outf * 100) / 100,
      net: Math.round(net * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  const summary = {
    horizon_days: horizon,
    total_projected_inflow: Math.round(
      series.reduce((s, x) => s + x.inflow, 0) * 100
    ) / 100,
    total_projected_outflow: Math.round(
      series.reduce((s, x) => s + x.outflow, 0) * 100
    ) / 100,
    negative_days: series.filter((x) => x.cumulative < 0).length,
  };

  return apiOk({
    series,
    summary,
    meta: {
      inflow_source: "receivables (pending/partial) por due_date",
      outflow_source:
        "accounts_payable (pending/partial) por due_date; PCs confirmados sem AP por expected_delivery",
    },
  });
}
