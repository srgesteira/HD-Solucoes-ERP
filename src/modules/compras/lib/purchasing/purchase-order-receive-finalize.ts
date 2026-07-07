import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  applyPurchaseOrderReceive,
  type ReceivePurchaseOrderResult,
} from "@/modules/compras/lib/purchasing/purchase-order-receive";
import { confirmProvisionalPayablesForPurchaseOrder } from "@/modules/compras/lib/purchasing/purchase-payables";

type Admin = SupabaseClient<Database>;

export type FinalizePurchaseOrderReceiveResult = {
  order: Database["public"]["Tables"]["purchase_orders"]["Row"] | null;
  receive: ReceivePurchaseOrderResult;
};

/**
 * Handler único de recebimento de PC: custo pousado + entrada por delta + status received.
 * Usado por POST /receive e PUT status=received.
 */
export async function finalizePurchaseOrderReceive(
  admin: Admin,
  tenantId: string,
  orderId: string
): Promise<FinalizePurchaseOrderReceiveResult> {
  const receive = await applyPurchaseOrderReceive(admin, tenantId, orderId);

  const { data, error } = await admin
    .from("purchase_orders")
    .update({
      status: "received",
      actual_delivery: new Date().toISOString().slice(0, 10),
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  try {
    await confirmProvisionalPayablesForPurchaseOrder(admin, tenantId, orderId);
  } catch (apErr) {
    console.warn(
      "[purchase-order] Falha ao confirmar pagáveis no recebimento:",
      apErr instanceof Error ? apErr.message : apErr
    );
  }

  return { order: data, receive };
}
