import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";

type AdminClient = SupabaseClient<Database>;

/** Verifica itens do pedido e actualiza `ready_for_invoice` se todos concluídos. */
export async function syncSalesOrderReadyForInvoice(
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
  if (!soiRows?.length) {
    await admin
      .from("sales_orders")
      .update({ ready_for_invoice: false })
      .eq("id", salesOrderId)
      .eq("tenant_id", tenantId);
    return false;
  }

  const soiIds = soiRows.map((r) => r.id);
  const { data: oiRows, error: oiErr } = await admin
    .from("order_items")
    .select(
      "sales_order_item_id, production_start, production_end, status, completed_at, apontamento_start_at, apontamento_end_at"
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("sales_order_item_id", soiIds);

  if (oiErr) throw new Error(oiErr.message);

  const oiBySoi = new Map<
    string,
    {
      production_start: string | null;
      production_end: string | null;
      status: string | null;
      completed_at: string | null;
      apontamento_start_at: string | null;
      apontamento_end_at: string | null;
    }
  >();
  for (const oi of oiRows ?? []) {
    if (oi.sales_order_item_id) {
      oiBySoi.set(oi.sales_order_item_id, oi);
    }
  }

  const allComplete = soiIds.every((id) => {
    const row = oiBySoi.get(id);
    if (!row) return false;
    return isOrderItemProductionFinished(row);
  });

  if (!allComplete) {
    const { error: updErr } = await admin
      .from("sales_orders")
      .update({ ready_for_invoice: false })
      .eq("id", salesOrderId)
      .eq("tenant_id", tenantId);
    if (updErr) throw new Error(updErr.message);
    return false;
  }

  return true;
}

export async function maybeMarkSalesOrderReadyForInvoice(
  admin: AdminClient,
  tenantId: string,
  orderItemId: string
): Promise<void> {
  const { data: oi } = await admin
    .from("order_items")
    .select("sales_order_item_id")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .maybeSingle();

  if (!oi?.sales_order_item_id) return;

  const { data: soi } = await admin
    .from("sales_order_items")
    .select("sales_order_id")
    .eq("id", oi.sales_order_item_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!soi?.sales_order_id) return;

  await syncSalesOrderReadyForInvoice(admin, tenantId, soi.sales_order_id);
}

/** Marca manualmente o pedido como liberado para faturamento (PCP). */
export async function markSalesOrderReadyForInvoice(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<void> {
  const { error } = await admin
    .from("sales_orders")
    .update({ ready_for_invoice: true })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
}
