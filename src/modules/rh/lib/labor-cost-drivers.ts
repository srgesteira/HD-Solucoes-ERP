import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { monthBounds } from "@/modules/rh/lib/labor-allocation-period";

type Admin = SupabaseClient<Database>;

export type AllocationDriver =
  | "hours"
  | "purchase_orders"
  | "shipped_weight"
  | "movements_count";

/** Pesos por work_center_id para rateio (driver purchase_orders). */
export async function getPurchaseOrderWeightPerLine(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<Map<string, number>> {
  const { firstDay, lastDay } = monthBounds(year, month);
  const weights = new Map<string, number>();

  const { data: plRows } = await admin
    .from("production_lines")
    .select("id, work_center_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const lineToWc = new Map<string, string>();
  const activeWcIds = new Set<string>();
  for (const pl of plRows ?? []) {
    if (pl.work_center_id) {
      lineToWc.set(pl.id, pl.work_center_id);
      activeWcIds.add(pl.work_center_id);
    }
  }

  const { data: poRows, error: poErr } = await admin
    .from("purchase_orders")
    .select("id, order_date")
    .eq("tenant_id", tenantId)
    .gte("order_date", firstDay)
    .lte("order_date", lastDay);

  if (poErr) throw new Error(poErr.message);
  const poIds = (poRows ?? []).map((p) => p.id);
  if (poIds.length === 0) {
    return equalWeights(activeWcIds);
  }

  const { data: items, error: iErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, purchase_order_id, sales_order_item_id, production_item_id"
    )
    .eq("tenant_id", tenantId)
    .in("purchase_order_id", poIds);

  if (iErr) throw new Error(iErr.message);

  const productionItemIds = (items ?? [])
    .map((i) => i.production_item_id)
    .filter((id): id is string => !!id);

  const salesItemIds = (items ?? [])
    .map((i) => i.sales_order_item_id)
    .filter((id): id is string => !!id);

  const orderItemByProdId = new Map<string, string | null>();
  if (productionItemIds.length > 0) {
    const { data: oiProd } = await admin
      .from("order_items")
      .select("id, line_id")
      .eq("tenant_id", tenantId)
      .in("id", productionItemIds);
    for (const oi of oiProd ?? []) {
      orderItemByProdId.set(oi.id, oi.line_id);
    }
  }

  const lineIdsBySalesItem = new Map<string, Set<string>>();
  if (salesItemIds.length > 0) {
    const { data: oiSales } = await admin
      .from("order_items")
      .select("sales_order_item_id, line_id")
      .eq("tenant_id", tenantId)
      .in("sales_order_item_id", salesItemIds);
    for (const oi of oiSales ?? []) {
      if (!oi.sales_order_item_id || !oi.line_id) continue;
      const set = lineIdsBySalesItem.get(oi.sales_order_item_id) ?? new Set();
      set.add(oi.line_id);
      lineIdsBySalesItem.set(oi.sales_order_item_id, set);
    }
  }

  const poToLines = new Map<string, Set<string>>();

  for (const item of items ?? []) {
    const lineIds = new Set<string>();

    if (item.production_item_id) {
      const plId = orderItemByProdId.get(item.production_item_id);
      if (plId) lineIds.add(plId);
    }
    if (item.sales_order_item_id) {
      const fromSales = lineIdsBySalesItem.get(item.sales_order_item_id);
      if (fromSales) {
        for (const lid of fromSales) lineIds.add(lid);
      }
    }

    if (lineIds.size === 0 || !item.purchase_order_id) continue;

    const poSet = poToLines.get(item.purchase_order_id) ?? new Set();
    for (const lid of lineIds) poSet.add(lid);
    poToLines.set(item.purchase_order_id, poSet);
  }

  for (const [, lineIds] of poToLines) {
    const share = 1 / lineIds.size;
    for (const plId of lineIds) {
      const wcId = lineToWc.get(plId);
      if (!wcId) continue;
      weights.set(wcId, (weights.get(wcId) ?? 0) + share);
    }
  }

  if (weights.size === 0) {
    return equalWeights(activeWcIds);
  }

  return weights;
}

function equalWeights(wcIds: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  if (wcIds.size === 0) return m;
  const w = 1 / wcIds.size;
  for (const id of wcIds) m.set(id, w);
  return m;
}

/** Esqueleto: drivers futuros devolvem pesos iguais. */
export async function getStubDriverWeights(
  admin: Admin,
  tenantId: string
): Promise<Map<string, number>> {
  const { data: lines } = await admin
    .from("work_centers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  return equalWeights(new Set((lines ?? []).map((l) => l.id)));
}
