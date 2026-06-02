import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export function roundBomCost(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/** Sincroniza unit_cost das linhas de material do pai com o cost_price actual do catálogo. */
export async function syncBomMaterialUnitCostsForParent(
  admin: Admin,
  tenantId: string,
  parentProductId: string
): Promise<number> {
  const { data: lines, error: lineErr } = await admin
    .from("product_components")
    .select("id, component_product_id")
    .eq("parent_product_id", parentProductId)
    .eq("tenant_id", tenantId)
    .eq("is_labor", false);

  if (lineErr) throw new Error(lineErr.message);

  const materialLines = (lines ?? []).filter(
    (l) => typeof l.component_product_id === "string" && l.component_product_id.length > 0
  );
  if (!materialLines.length) return 0;

  const componentIds = [
    ...new Set(materialLines.map((l) => l.component_product_id as string)),
  ];

  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("tenant_id", tenantId)
    .in("id", componentIds);

  if (prodErr) throw new Error(prodErr.message);

  const costById = new Map(
    (products ?? []).map((p) => [p.id, roundBomCost(Number(p.cost_price ?? 0))])
  );

  let updated = 0;
  for (const line of materialLines) {
    const cid = line.component_product_id as string;
    const nextCost = costById.get(cid);
    if (nextCost === undefined) continue;

    const { error: upErr } = await admin
      .from("product_components")
      .update({ unit_cost: nextCost })
      .eq("id", line.id)
      .eq("tenant_id", tenantId);

    if (upErr) throw new Error(upErr.message);
    updated += 1;
  }

  return updated;
}
