import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type { GrossMaterialNeed } from "@/modules/pcp/lib/mrp-service";

type Admin = SupabaseClient<Database>;

type ProductPrefixRow = {
  id: string;
  prefix:
    | { code: string | null }
    | { code: string | null }[]
    | null;
};

/** Remove mão-de-obra (prefixo MO) — não há baixa física em estoque. */
export async function filterPhysicalSupplyNeeds(
  admin: Admin,
  tenantId: string,
  needs: GrossMaterialNeed[]
): Promise<GrossMaterialNeed[]> {
  if (!needs.length) return [];

  const ids = [...new Set(needs.map((n) => n.product_id))];
  const { data: products, error } = await admin
    .from("products")
    .select("id, prefix:product_prefixes!products_prefix_id_fkey(code)")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (error) throw new Error(error.message);

  const laborIds = new Set<string>();
  for (const raw of (products ?? []) as unknown as ProductPrefixRow[]) {
    const prefix = Array.isArray(raw.prefix) ? raw.prefix[0] : raw.prefix;
    if (prefix?.code === "MO") laborIds.add(raw.id);
  }

  return needs.filter((n) => !laborIds.has(n.product_id));
}
