import type { AdminClient } from "@/modules/vendas/lib/sales/sales-flow";

/** Itens de OP com data de início de produção. */
export async function salesOrderHasProductionStart(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<boolean> {
  const { data: soiRows, error: soiErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (soiErr) throw new Error(soiErr.message);

  const soiIds = (soiRows ?? []).map((r) => r.id);
  if (!soiIds.length) return false;

  const { count, error: oiErr } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("sales_order_item_id", soiIds)
    .not("production_start", "is", null);

  if (oiErr) throw new Error(oiErr.message);
  return (count ?? 0) > 0;
}

/** Linhas de pedido de compra vinculadas às linhas do pedido de venda. */
export async function salesOrderHasLinkedPurchaseOrderItems(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<boolean> {
  const { data: soiRows, error: soiErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (soiErr) throw new Error(soiErr.message);

  const soiIds = (soiRows ?? []).map((r) => r.id);
  if (!soiIds.length) return false;

  const { count, error: poiErr } = await admin
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("sales_order_item_id", soiIds);

  if (poiErr) throw new Error(poiErr.message);
  return (count ?? 0) > 0;
}
