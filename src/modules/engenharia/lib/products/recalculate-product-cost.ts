import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { recordProductPriceHistory } from "@/modules/engenharia/lib/products/product-price-history";
import {
  roundBomCost,
  syncBomMaterialUnitCostsForParent,
} from "@/modules/engenharia/lib/products/bom-unit-cost-sync";

type Admin = SupabaseClient<Database>;

/**
 * Recalcula custo de produção a partir da BOM: sincroniza unit_cost dos materiais
 * com cost_price actual e actualiza products.cost_price do pai (via histórico production_cost).
 */
export async function recalculateProductCost(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<number> {
  await syncBomMaterialUnitCostsForParent(admin, tenantId, productId);

  const { data: components, error } = await admin
    .from("product_components")
    .select("quantity, unit_cost, is_labor, component_product_id")
    .eq("parent_product_id", productId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  const list = components ?? [];
  if (!list.length) {
    return 0;
  }

  const totalCost = list.reduce((sum, comp) => {
    const q = Number(comp.quantity ?? 0);
    return sum + q * roundBomCost(Number(comp.unit_cost ?? 0));
  }, 0);

  const rounded = roundBomCost(totalCost);

  await recordProductPriceHistory(admin, tenantId, productId, {
    priceType: "production_cost",
    value: rounded,
    notes: "Recalculado a partir da estrutura (BOM)",
  });

  return rounded;
}
