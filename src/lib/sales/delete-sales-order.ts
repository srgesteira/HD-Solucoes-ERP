import type { AdminClient } from "@/lib/sales/sales-flow";

/** Verifica se existem linhas em `order_items` ligadas às linhas do pedido. */
export async function salesOrderHasAssociatedOrderItems(
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
    .in("sales_order_item_id", soiIds);

  if (oiErr) throw new Error(oiErr.message);
  return (count ?? 0) > 0;
}

/** Exclusão física do pedido e dependentes comerciais (itens, recebíveis, logs, NF-e). */
export async function hardDeleteSalesOrder(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<void> {
  const { error: recvErr } = await admin
    .from("receivables")
    .delete()
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (recvErr) throw new Error(recvErr.message);

  const { error: nfeErr } = await admin
    .from("nfes")
    .delete()
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (nfeErr) throw new Error(nfeErr.message);

  const { error: logsErr } = await admin
    .from("sales_order_logs")
    .delete()
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (logsErr) throw new Error(logsErr.message);

  const { error: orderErr } = await admin
    .from("sales_orders")
    .delete()
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (orderErr) throw new Error(orderErr.message);
}
