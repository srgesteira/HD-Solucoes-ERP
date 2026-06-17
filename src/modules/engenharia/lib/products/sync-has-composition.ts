import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

/** Regra única: has_composition = existe ≥1 linha activa em product_components. */
export async function syncProductHasCompositionFromBom(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<boolean> {
  const { count, error: cErr } = await admin
    .from("product_components")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("parent_product_id", productId);

  if (cErr) throw new Error(cErr.message);

  const hasComposition = (count ?? 0) > 0;

  const { error: uErr } = await admin
    .from("products")
    .update({ has_composition: hasComposition })
    .eq("id", productId)
    .eq("tenant_id", tenantId);

  if (uErr) throw new Error(uErr.message);
  return hasComposition;
}
