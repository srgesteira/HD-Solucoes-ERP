import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export type BomComponentLine = {
  component_product_id: string;
  quantity: number;
};

/** Grafo BOM em memória — carregado numa única query por tenant. */
export type BomGraph = {
  childrenByParent: Map<string, BomComponentLine[]>;
  hasBom(productId: string): boolean;
};

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Pré-carrega todas as linhas de `product_components` do tenant (1 query). */
export async function loadBomGraph(
  admin: Admin,
  tenantId: string
): Promise<BomGraph> {
  const { data, error } = await admin
    .from("product_components")
    .select("parent_product_id, component_product_id, quantity")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  const childrenByParent = new Map<string, BomComponentLine[]>();

  for (const row of data ?? []) {
    if (!row.parent_product_id || !row.component_product_id) continue;
    const q = Number(row.quantity ?? 0);
    if (!Number.isFinite(q) || q <= 0) continue;
    const list = childrenByParent.get(row.parent_product_id) ?? [];
    list.push({
      component_product_id: row.component_product_id,
      quantity: q,
    });
    childrenByParent.set(row.parent_product_id, list);
  }

  return {
    childrenByParent,
    hasBom(productId: string) {
      return (childrenByParent.get(productId)?.length ?? 0) > 0;
    },
  };
}

/**
 * Explosão BOM em memória (mesma regra que collectMaterialNeeds legado):
 * componente com BOM → desce; sem BOM → necessidade de compra.
 */
export function explodeMaterialNeedsFromGraph(
  graph: BomGraph,
  productId: string,
  multiplier: number,
  acc: Map<string, number>,
  stack: Set<string> = new Set()
): void {
  if (stack.has(productId)) return;
  stack.add(productId);

  if (!graph.hasBom(productId)) {
    const cur = acc.get(productId) ?? 0;
    acc.set(productId, round4(cur + multiplier));
    stack.delete(productId);
    return;
  }

  const lines = graph.childrenByParent.get(productId) ?? [];
  for (const row of lines) {
    const cid = row.component_product_id;
    const q = row.quantity * multiplier;
    if (!Number.isFinite(q) || q <= 0) continue;

    if (graph.hasBom(cid)) {
      explodeMaterialNeedsFromGraph(graph, cid, q, acc, stack);
    } else {
      const cur = acc.get(cid) ?? 0;
      acc.set(cid, round4(cur + q));
    }
  }

  stack.delete(productId);
}

export function grossNeedsFromGraph(
  graph: BomGraph,
  productId: string,
  quantity: number
): Map<string, number> {
  const qty = Number(quantity ?? 0);
  const needs = new Map<string, number>();
  if (!Number.isFinite(qty) || qty <= 0) return needs;
  explodeMaterialNeedsFromGraph(graph, productId, qty, needs, new Set());
  return needs;
}
