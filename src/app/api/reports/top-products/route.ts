import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertReportsAccess } from "@/lib/utils/report-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/top-products?days=90
 */
export async function GET(request: NextRequest) {
  const gate = await assertReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const days = Math.min(
    365,
    Math.max(7, parseInt(request.nextUrl.searchParams.get("days") ?? "90", 10) || 90)
  );
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);

  const admin = createSupabaseAdminClient();

  const { data: orders, error: oErr } = await admin
    .from("sales_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("order_date", fromStr);

  if (oErr) {
    return apiError("Pedidos de venda: " + oErr.message, 500);
  }

  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length === 0) {
    return apiOk({ rows: [], days });
  }

  const { data: items, error: iErr } = await admin
    .from("sales_order_items")
    .select("product_id, quantity, total_price")
    .eq("tenant_id", tenantId)
    .in("sales_order_id", orderIds);

  if (iErr) {
    return apiError("Itens: " + iErr.message, 500);
  }

  type Agg = { qty: number; revenue: number };
  const byProduct = new Map<string, Agg>();
  for (const it of items ?? []) {
    const pid = it.product_id;
    if (!pid) continue;
    const q = Number(it.quantity ?? 0);
    const rev = Number(it.total_price ?? 0);
    const cur = byProduct.get(pid) ?? { qty: 0, revenue: 0 };
    cur.qty += Number.isFinite(q) ? q : 0;
    cur.revenue += Number.isFinite(rev) ? rev : 0;
    byProduct.set(pid, cur);
  }

  const productIds = [...byProduct.keys()];
  if (productIds.length === 0) {
    return apiOk({ rows: [], days });
  }

  const { data: products, error: pErr } = await admin
    .from("products")
    .select("id, code, name")
    .eq("tenant_id", tenantId)
    .in("id", productIds);

  if (pErr) {
    return apiError("Produtos: " + pErr.message, 500);
  }

  const nameById = new Map(
    (products ?? []).map((p) => [
      p.id,
      { code: p.code ?? "", name: p.name ?? "" },
    ])
  );

  const rows = [...byProduct.entries()]
    .map(([id, agg]) => {
      const meta = nameById.get(id);
      return {
        product_id: id,
        technical_code: meta?.code ?? "—",
        name: meta?.name ?? "—",
        quantity: Math.round(agg.qty * 1000) / 1000,
        revenue: Math.round(agg.revenue * 100) / 100,
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  return apiOk({ rows, days });
}
