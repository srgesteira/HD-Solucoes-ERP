import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import { addDaysIso } from "@/modules/core/lib/dashboard/month-range";
import {
  daysBetweenIso,
  parseDashboardPeriod,
  round1,
  round2,
} from "@/modules/core/lib/dashboard/period";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await assertFinanceOrReportsAccess();
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { from, to } = parseDashboardPeriod(request.nextUrl.searchParams);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDaysIso(today, 30);
  const admin = createSupabaseAdminClient();

  const { data: overdue } = await admin
    .from("receivables")
    .select("current_amount, client_name")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial", "overdue"])
    .lt("due_date", today);

  const overdueTotal = (overdue ?? []).reduce(
    (s, r) => s + Number(r.current_amount ?? 0),
    0
  );

  const byClient = new Map<string, number>();
  for (const r of overdue ?? []) {
    const name = r.client_name?.trim() || "Sem cliente";
    byClient.set(
      name,
      (byClient.get(name) ?? 0) + Number(r.current_amount ?? 0)
    );
  }
  const topDelinquent = [...byClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([client_name, amount]) => ({
      client_name,
      amount: round2(amount),
    }));

  const { data: upcoming } = await admin
    .from("receivables")
    .select("current_amount")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial"])
    .gte("due_date", today)
    .lte("due_date", horizon);

  const projectedInflow = (upcoming ?? []).reduce(
    (s, r) => s + Number(r.current_amount ?? 0),
    0
  );

  const { data: salesOrders } = await admin
    .from("sales_orders")
    .select("id, total")
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "delivered"])
    .gte("order_date", from)
    .lte("order_date", to);

  const orderIds = (salesOrders ?? []).map((o) => o.id);
  const revenue = (salesOrders ?? []).reduce(
    (s, o) => s + Number(o.total ?? 0),
    0
  );

  let totalCost = 0;
  if (orderIds.length > 0) {
    const { data: orderItems } = await admin
      .from("sales_order_items")
      .select("total_cost")
      .eq("tenant_id", tenantId)
      .in("sales_order_id", orderIds);

    totalCost = (orderItems ?? []).reduce(
      (s, i) => s + Number(i.total_cost ?? 0),
      0
    );
  }

  const netMarginPct =
    revenue > 0 ? round1(((revenue - totalCost) / revenue) * 100) : null;

  const { data: paidReceivables } = await admin
    .from("receivables")
    .select("due_date, payment_date")
    .eq("tenant_id", tenantId)
    .eq("status", "paid")
    .not("payment_date", "is", null)
    .gte("payment_date", from)
    .lte("payment_date", to);

  let dsoSum = 0;
  let dsoCount = 0;
  for (const r of paidReceivables ?? []) {
    const due = r.due_date;
    const paid = r.payment_date;
    if (!due || !paid) continue;
    dsoSum += daysBetweenIso(due, paid);
    dsoCount++;
  }

  const dsoDays = dsoCount > 0 ? round1(dsoSum / dsoCount) : null;

  return apiOk({
    data: {
      period_from: from,
      period_to: to,
      overdue_receivables_total: round2(overdueTotal),
      projected_cashflow_30d: round2(projectedInflow),
      top_delinquent_clients: topDelinquent,
      net_margin_pct: netMarginPct,
      revenue_period: round2(revenue),
      cost_period: round2(totalCost),
      dso_days: dsoDays,
    },
  });
}
