import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  daysBetweenIso,
  last90DaysRange,
  parseDashboardPeriod,
  round1,
  round2,
} from "@/modules/core/lib/dashboard/period";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { from, to } = parseDashboardPeriod(request.nextUrl.searchParams);
  const range90 = last90DaysRange();
  const admin = createSupabaseAdminClient();

  const { count: pendingOrders } = await admin
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("status", ["draft", "sent", "partial"]);

  const { count: outOfStock } = await admin
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .lte("quantity_on_hand", 0);

  const { data: receivedMonth } = await admin
    .from("purchase_orders")
    .select("total")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("status", "received")
    .gte("order_date", from)
    .lte("order_date", to);

  const totals = (receivedMonth ?? []).map((r) => Number(r.total ?? 0));
  const sum = totals.reduce((a, b) => a + b, 0);
  const avgPurchaseCost =
    totals.length > 0 ? round2(sum / totals.length) : 0;

  const { data: received90 } = await admin
    .from("purchase_orders")
    .select("order_date, expected_delivery, actual_delivery")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("status", "received")
    .not("actual_delivery", "is", null)
    .gte("actual_delivery", range90.from)
    .lte("actual_delivery", range90.to);

  const receivedList = received90 ?? [];
  let leadTimeSum = 0;
  let leadTimeCount = 0;
  let delayedCount = 0;
  let comparableDelay = 0;

  for (const po of receivedList) {
    const actual = po.actual_delivery;
    const ordered = po.order_date;
    if (actual && ordered) {
      const days = daysBetweenIso(ordered, actual);
      if (days >= 0) {
        leadTimeSum += days;
        leadTimeCount++;
      }
    }
    const expected = po.expected_delivery;
    if (actual && expected) {
      comparableDelay++;
      if (actual > expected) delayedCount++;
    }
  }

  const avgLeadTimeDays =
    leadTimeCount > 0 ? round1(leadTimeSum / leadTimeCount) : null;

  const supplierDelayRatePct =
    comparableDelay > 0
      ? round1((delayedCount / comparableDelay) * 100)
      : null;

  return apiOk({
    data: {
      period_from: from,
      period_to: to,
      pending_purchase_orders: pendingOrders ?? 0,
      out_of_stock_items: outOfStock ?? 0,
      avg_purchase_cost_month: avgPurchaseCost,
      month_purchases_total: round2(sum),
      avg_lead_time_days: avgLeadTimeDays,
      lead_time_period_from: range90.from,
      lead_time_period_to: range90.to,
      supplier_delay_rate_pct: supplierDelayRatePct,
      received_orders_90d: receivedList.length,
    },
  });
}
