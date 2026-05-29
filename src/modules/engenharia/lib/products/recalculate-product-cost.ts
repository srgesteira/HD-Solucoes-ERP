import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { recordProductPriceHistory } from "@/modules/engenharia/lib/products/product-price-history";

/** Recalcula custo de produção a partir da BOM e actualiza `products.cost_price`. */
export async function recalculateProductCost(
  admin: SupabaseClient<Database>,
  tenantId: string,
  productId: string
): Promise<number> {
  const { data: components } = await admin
    .from("product_components")
    .select("quantity, unit_cost, is_labor, component_product_id")
    .eq("parent_product_id", productId)
    .eq("tenant_id", tenantId);

  const list = components ?? [];
  if (!list.length) {
    return 0;
  }

  const componentIds = [
    ...new Set(
      list
        .map((c) => c.component_product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const costByProductId = new Map<string, number>();
  if (componentIds.length) {
    const { data: prods } = await admin
      .from("products")
      .select("id, cost_price")
      .eq("tenant_id", tenantId)
      .in("id", componentIds);
    for (const p of prods ?? []) {
      costByProductId.set(p.id, Number(p.cost_price ?? 0));
    }
  }

  const totalCost = list.reduce((sum, comp) => {
    const q = Number(comp.quantity ?? 0);
    if (comp.is_labor) {
      return sum + q * Number(comp.unit_cost ?? 0);
    }
    const cid = comp.component_product_id;
    const unit =
      cid != null
        ? (costByProductId.get(cid) ?? Number(comp.unit_cost ?? 0))
        : Number(comp.unit_cost ?? 0);
    return sum + q * unit;
  }, 0);

  await recordProductPriceHistory(admin, tenantId, productId, {
    priceType: "production_cost",
    value: totalCost,
    notes: "Recalculado a partir da estrutura (BOM)",
  });

  return totalCost;
}
