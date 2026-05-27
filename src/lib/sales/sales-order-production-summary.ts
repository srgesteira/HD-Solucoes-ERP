import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { computeOrderProductionDeadline } from "@/lib/pcp-planning";
import {
  computeOrderProductionAggregateStatus,
  type OrderItemProductionFields,
  toSalesProductionSituation,
  type SalesProductionSituation,
} from "@/lib/order-item-production-status";

type AdminClient = SupabaseClient<Database>;

export type SalesOrderProductionSituation = SalesProductionSituation;

export type SalesOrderProductionSummary = {
  production_deadline: string | null;
  production_situation: SalesOrderProductionSituation;
  production_status: ReturnType<typeof computeOrderProductionAggregateStatus>;
};

export function computeSalesOrderProductionSituation(
  orderItems: OrderItemProductionFields[]
): SalesOrderProductionSituation {
  return toSalesProductionSituation(
    computeOrderProductionAggregateStatus(orderItems)
  );
}

export async function enrichSalesOrdersListWithProduction(
  admin: AdminClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, SalesOrderProductionSummary>> {
  const result = new Map<string, SalesOrderProductionSummary>();
  if (!orderIds.length) return result;

  const { data: soiRows, error: soiErr } = await admin
    .from("sales_order_items")
    .select("id, sales_order_id")
    .eq("tenant_id", tenantId)
    .in("sales_order_id", orderIds);

  if (soiErr) throw new Error(soiErr.message);

  const soiIdToOrderId = new Map<string, string>();
  for (const row of soiRows ?? []) {
    soiIdToOrderId.set(row.id, row.sales_order_id);
  }

  const itemsByOrder = new Map<string, OrderItemProductionFields[]>();
  for (const oid of orderIds) itemsByOrder.set(oid, []);

  const soiIds = [...soiIdToOrderId.keys()];
  if (soiIds.length) {
    const { data: oiRows, error: oiErr } = await admin
      .from("order_items")
      .select(
        "sales_order_item_id, production_start, production_end, status, completed_at"
      )
      .eq("tenant_id", tenantId)
      .in("sales_order_item_id", soiIds);

    if (oiErr) throw new Error(oiErr.message);

    for (const oi of oiRows ?? []) {
      if (!oi.sales_order_item_id) continue;
      const orderId = soiIdToOrderId.get(oi.sales_order_item_id);
      if (!orderId) continue;
      const list = itemsByOrder.get(orderId) ?? [];
      list.push({
        production_start: oi.production_start,
        production_end: oi.production_end,
        status: oi.status,
        completed_at: oi.completed_at,
      });
      itemsByOrder.set(orderId, list);
    }
  }

  for (const oid of orderIds) {
    const items = itemsByOrder.get(oid) ?? [];
    const aggregate = computeOrderProductionAggregateStatus(items);
    result.set(oid, {
      production_situation: toSalesProductionSituation(aggregate),
      production_status: aggregate,
      production_deadline: computeOrderProductionDeadline(
        items.map((i) => ({ production_end: i.production_end })),
        null
      ),
    });
  }

  return result;
}
