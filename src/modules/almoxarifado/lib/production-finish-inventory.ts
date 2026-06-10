import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { applyInventoryInbound } from "@/modules/almoxarifado/lib/inventory-inbound";
import { INVENTORY_ORIGIN } from "@/modules/almoxarifado/lib/inventory-origins";

type Admin = SupabaseClient<Database>;

type FinishItemRow = {
  id: string;
  product_id: string | null;
  quantity: number;
  is_suggestion: boolean;
  production_order:
    | { order_number: string }
    | { order_number: string }[]
    | null;
};

export type ProductionFinishInboundResult = {
  order_item_id: string;
  posted: boolean;
  skipped?: boolean;
  quantity?: number;
};

export async function applyProductionFinishInbound(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  userId?: string | null
): Promise<ProductionFinishInboundResult> {
  const { data: raw, error } = await admin
    .from("order_items")
    .select(
      `
      id,
      product_id,
      quantity,
      is_suggestion,
      production_order:production_orders!order_items_order_id_fkey(order_number)
    `.trim()
    )
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!raw) throw new Error("Item de produção não encontrado.");

  const item = raw as unknown as FinishItemRow;
  if (item.is_suggestion) {
    return { order_item_id: orderItemId, posted: false, skipped: true };
  }

  const productId = item.product_id;
  if (!productId) {
    return { order_item_id: orderItemId, posted: false, skipped: true };
  }

  const qty = Number(item.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { order_item_id: orderItemId, posted: false, skipped: true };
  }

  const poRaw = item.production_order;
  const po = Array.isArray(poRaw) ? poRaw[0] : poRaw;
  const orderNumber = po?.order_number ?? orderItemId.slice(0, 8);

  const invRes = await applyInventoryInbound(admin, tenantId, productId, qty, {
    reason: `Produção finalizada OP ${orderNumber}`,
    referenceId: orderItemId,
    origin: INVENTORY_ORIGIN.PRODUCTION_FINISH,
    userId,
  });

  if (invRes.error) throw new Error(invRes.error);
  if (invRes.skipped) {
    return { order_item_id: orderItemId, posted: false, skipped: true, quantity: qty };
  }

  return { order_item_id: orderItemId, posted: true, quantity: qty };
}

/** Entrada de todos os itens da OP (idempotente por item). */
export async function applyProductionFinishInboundForOrder(
  admin: Admin,
  tenantId: string,
  productionOrderId: string,
  userId?: string | null
): Promise<ProductionFinishInboundResult[]> {
  const { data: items, error } = await admin
    .from("order_items")
    .select("id")
    .eq("order_id", productionOrderId)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false);

  if (error) throw new Error(error.message);

  const results: ProductionFinishInboundResult[] = [];
  for (const it of items ?? []) {
    results.push(
      await applyProductionFinishInbound(admin, tenantId, it.id, userId)
    );
  }
  return results;
}
