import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  roundBomCost,
  syncBomMaterialUnitCostsForParent,
} from "@/modules/engenharia/lib/products/bom-unit-cost-sync";
import { recalculateProductCost } from "@/modules/engenharia/lib/products/recalculate-product-cost";

type Admin = SupabaseClient<Database>;

const DEFAULT_MAX_DEPTH = 32;

export type PropagateComponentCostResult = {
  /** Linhas de BOM (material) com unit_cost sincronizado ao componente inicial. */
  initialLinesUpdated: number;
  /** Produtos pai que tiveram BOM recalculada na cascata. */
  parentsProcessed: number;
  /** Pais ignorados por ciclo ou profundidade máxima. */
  parentsSkipped: number;
};

async function syncComponentLinesUnitCost(
  admin: Admin,
  tenantId: string,
  componentProductId: string,
  unitCost: number
): Promise<number> {
  const { data, error } = await admin
    .from("product_components")
    .update({ unit_cost: unitCost })
    .eq("tenant_id", tenantId)
    .eq("component_product_id", componentProductId)
    .eq("is_labor", false)
    .select("id");

  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

async function findParentIdsUsingComponent(
  admin: Admin,
  tenantId: string,
  componentProductId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("product_components")
    .select("parent_product_id")
    .eq("tenant_id", tenantId)
    .eq("component_product_id", componentProductId);

  if (error) throw new Error(error.message);

  return [
    ...new Set(
      (data ?? [])
        .map((r) => r.parent_product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
}

/**
 * Quando o cost_price de um componente muda: sincroniza linhas de BOM e recalcula pais em cascata.
 * Não altera sales_order_items nem quote_items.
 */
export async function propagateComponentCostChange(
  admin: Admin,
  tenantId: string,
  componentProductId: string,
  options?: { maxDepth?: number }
): Promise<PropagateComponentCostResult> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  const { data: component, error: compErr } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("id", componentProductId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (compErr) throw new Error(compErr.message);
  if (!component) {
    return { initialLinesUpdated: 0, parentsProcessed: 0, parentsSkipped: 0 };
  }

  const unitCost = roundBomCost(Number(component.cost_price ?? 0));
  const initialLinesUpdated = await syncComponentLinesUnitCost(
    admin,
    tenantId,
    componentProductId,
    unitCost
  );

  const queue: Array<{ parentId: string; depth: number }> = [];
  for (const parentId of await findParentIdsUsingComponent(
    admin,
    tenantId,
    componentProductId
  )) {
    queue.push({ parentId, depth: 0 });
  }

  const processedParents = new Set<string>();
  let parentsProcessed = 0;
  let parentsSkipped = 0;

  while (queue.length > 0) {
    const { parentId, depth } = queue.shift()!;

    if (processedParents.has(parentId)) {
      parentsSkipped += 1;
      continue;
    }
    if (depth >= maxDepth) {
      parentsSkipped += 1;
      continue;
    }
    if (parentId === componentProductId) {
      parentsSkipped += 1;
      continue;
    }

    processedParents.add(parentId);

    const { data: parentBefore, error: beforeErr } = await admin
      .from("products")
      .select("cost_price")
      .eq("id", parentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (beforeErr) throw new Error(beforeErr.message);
    const oldParentCost = roundBomCost(Number(parentBefore?.cost_price ?? 0));

    await syncBomMaterialUnitCostsForParent(admin, tenantId, parentId);
    const newParentCost = await recalculateProductCost(admin, tenantId, parentId);
    parentsProcessed += 1;

    const parentUnitCost = roundBomCost(newParentCost);
    const parentCostChanged = parentUnitCost !== oldParentCost;
    await syncComponentLinesUnitCost(
      admin,
      tenantId,
      parentId,
      parentUnitCost
    );

    const grandparents = await findParentIdsUsingComponent(
      admin,
      tenantId,
      parentId
    );
    for (const gp of grandparents) {
      if (parentCostChanged) {
        processedParents.delete(gp);
        queue.push({ parentId: gp, depth: depth + 1 });
      } else if (!processedParents.has(gp)) {
        queue.push({ parentId: gp, depth: depth + 1 });
      }
    }
  }

  return { initialLinesUpdated, parentsProcessed, parentsSkipped };
}
