import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";
import { parseDashboardPeriod, round2 } from "@/lib/dashboard/period";
import { asUntypedAdmin } from "@/lib/supabase/untyped-tables";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await assertModuleAccess("sales");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { from, to } = parseDashboardPeriod(request.nextUrl.searchParams);
  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const { count: totalQuotes } = await admin
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("quote_date", from)
    .lte("quote_date", to);

  const { data: statusRows } = await admin
    .from("quotes")
    .select("status, total")
    .eq("tenant_id", tenantId)
    .gte("quote_date", from)
    .lte("quote_date", to);

  let sent = 0;
  let converted = 0;
  let rejected = 0;
  let totalConvertedValue = 0;
  let convertedCount = 0;

  for (const q of statusRows ?? []) {
    if (q.status === "sent") sent++;
    if (q.status === "converted") {
      converted++;
      totalConvertedValue += Number(q.total ?? 0);
      convertedCount++;
    }
    if (q.status === "rejected") rejected++;
  }

  const submitted = sent + converted + rejected;
  const conversionRatePct =
    submitted > 0 ? Math.round((converted / submitted) * 1000) / 10 : null;

  const avgTicketQuote =
    convertedCount > 0
      ? round2(totalConvertedValue / convertedCount)
      : 0;

  const { data: salesOrders } = await admin
    .from("sales_orders")
    .select("total")
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "delivered"])
    .gte("order_date", from)
    .lte("order_date", to);

  const orderTotals = (salesOrders ?? []).map((o) => Number(o.total ?? 0));
  const averageTicket =
    orderTotals.length > 0
      ? round2(
          orderTotals.reduce((a, b) => a + b, 0) / orderTotals.length
        )
      : 0;

  const { data: topItems } = await admin
    .from("sales_order_items")
    .select("quantity, product:products(name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", `${from}T00:00:00`);

  const qtyByProduct = new Map<string, number>();
  for (const row of topItems ?? []) {
    const prod = row.product as
      | { name?: string }
      | { name?: string }[]
      | null;
    const name = Array.isArray(prod)
      ? prod[0]?.name
      : (prod?.name ?? "Sem nome");
    const key = name?.trim() || "Sem nome";
    qtyByProduct.set(
      key,
      (qtyByProduct.get(key) ?? 0) + Number(row.quantity ?? 0)
    );
  }

  const topProducts = [...qtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, quantity]) => ({ name, quantity }));

  const { data: rejections } = await db
    .from("quote_rejections")
    .select("rejection_reason_id, reason:rejection_reasons(reason)")
    .eq("tenant_id", tenantId)
    .gte("created_at", `${from}T00:00:00`);

  const reasonCounts = new Map<string, number>();
  for (const r of rejections ?? []) {
    const reasonRow = r.reason as
      | { reason?: string }
      | { reason?: string }[]
      | null;
    const label = Array.isArray(reasonRow)
      ? reasonRow[0]?.reason
      : (reasonRow?.reason ?? "Outro");
    const key = label?.trim() || "Outro";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }

  const rejectionsByReason = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return apiOk({
    data: {
      month_from: from,
      month_to: to,
      total_quotes: totalQuotes ?? 0,
      conversion_rate_pct: conversionRatePct,
      avg_ticket: avgTicketQuote,
      average_ticket: averageTicket,
      rejected_count: rejected,
      top_products: topProducts,
      rejections_by_reason: rejectionsByReason,
    },
  });
}
