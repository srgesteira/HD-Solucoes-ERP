import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";
import { parseDashboardPeriod, round2 } from "@/lib/dashboard/period";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await assertModuleAccess("sales");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { from, to } = parseDashboardPeriod(request.nextUrl.searchParams);
  const admin = createSupabaseAdminClient();

  const { data: orders } = await admin
    .from("sales_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "delivered"])
    .gte("order_date", from)
    .lte("order_date", to);

  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length === 0) {
    return apiOk({
      data: {
        period_from: from,
        period_to: to,
        top_products: [],
      },
    });
  }

  const { data: items } = await admin
    .from("sales_order_items")
    .select(
      "total_price, total_cost, product_id, product:products(name, code)"
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_id", orderIds);

  const marginByProduct = new Map<
    string,
    { name: string; code: string | null; gross_margin: number }
  >();

  for (const row of items ?? []) {
    const prod = row.product as
      | { name?: string; code?: string | null }
      | { name?: string; code?: string | null }[]
      | null;
    const p = Array.isArray(prod) ? prod[0] : prod;
    const key = row.product_id ?? p?.name ?? "unknown";
    const price = Number(row.total_price ?? 0);
    const cost = Number(row.total_cost ?? 0);
    const margin = price - cost;

    const existing = marginByProduct.get(key);
    if (existing) {
      existing.gross_margin += margin;
    } else {
      marginByProduct.set(key, {
        name: p?.name?.trim() || "Sem nome",
        code: p?.code ?? null,
        gross_margin: margin,
      });
    }
  }

  const topProducts = [...marginByProduct.values()]
    .map((p) => ({
      name: p.name,
      code: p.code,
      gross_margin: round2(p.gross_margin),
    }))
    .sort((a, b) => b.gross_margin - a.gross_margin)
    .slice(0, 10);

  return apiOk({
    data: {
      period_from: from,
      period_to: to,
      top_products: topProducts,
    },
  });
}
