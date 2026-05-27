import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertModuleAccess } from "@/modules/core/lib/module-access";
import { round1 } from "@/modules/core/lib/dashboard/period";
import { PRODUCT_NATURE_CODES } from "@/modules/engenharia/lib/products/mrp-product-nature";

export const dynamic = "force-dynamic";

/** Naturezas típicas de compra (exclui AC acabado). */
const PURCHASE_NATURES = new Set(
  PRODUCT_NATURE_CODES.filter((c) => c !== "AC")
);

type HistoryRow = {
  product_id: string;
  position: number;
  value: number;
  product: {
    id: string;
    name: string;
    code: string | null;
    cost_price: number;
    type: string;
    product_nature: string | null;
  } | null;
};

function isPurchasableProduct(prod: NonNullable<HistoryRow["product"]>): boolean {
  if (prod.product_nature && PURCHASE_NATURES.has(prod.product_nature as "MP")) {
    return true;
  }
  return prod.type === "raw" || prod.type === "component";
}

export async function GET() {
  const access = await assertModuleAccess("purchasing");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  const { data: history } = await admin
    .from("product_price_history")
    .select(
      "product_id, position, value, product:products(id, name, code, cost_price, type, product_nature)"
    )
    .eq("tenant_id", tenantId)
    .eq("price_type", "purchase")
    .eq("position", 2);

  const savingsRows: Array<{
    product_id: string;
    name: string;
    code: string | null;
    previous_price: number;
    current_price: number;
    savings_pct: number;
  }> = [];

  for (const row of (history ?? []) as HistoryRow[]) {
    const prod = row.product;
    if (!prod) continue;
    if (!isPurchasableProduct(prod)) continue;

    const previous = Number(row.value ?? 0);
    const current = Number(prod.cost_price ?? 0);
    if (previous <= 0) continue;

    const savingsPct = round1(((previous - current) / previous) * 100);
    savingsRows.push({
      product_id: prod.id,
      name: prod.name,
      code: prod.code,
      previous_price: previous,
      current_price: current,
      savings_pct: savingsPct,
    });
  }

  const positiveSavings = savingsRows.filter((r) => r.savings_pct > 0);
  const avgSavingsPct =
    positiveSavings.length > 0
      ? round1(
          positiveSavings.reduce((s, r) => s + r.savings_pct, 0) /
            positiveSavings.length
        )
      : null;

  const topProducts = [...savingsRows]
    .sort((a, b) => b.savings_pct - a.savings_pct)
    .slice(0, 5);

  return apiOk({
    data: {
      avg_savings_pct: avgSavingsPct,
      products_with_savings: positiveSavings.length,
      top_products: topProducts,
    },
  });
}
