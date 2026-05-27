import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { recordProductPriceHistory } from "@/lib/products/product-price-history";
import { purchaseOrderExtrasTotal, num } from "@/lib/purchasing/purchase-order-totals";

type Admin = SupabaseClient<Database>;

type PoItem = {
  id: string;
  product_id: string | null;
  quantity: number;
  total_price: number;
  received_quantity: number;
};

type PoRow = {
  id: string;
  status: string;
  subtotal: number;
  freight_cost: number;
  insurance_cost: number;
  other_costs: number;
  total_tax_non_creditable: number;
};

export type ReceivePurchaseOrderResult = {
  itemsUpdated: number;
  productsCostUpdated: number;
};

/**
 * Rateia custos extras do pedido pelos itens (proporção do total_price)
 * e actualiza cost_price + histórico (purchase) dos produtos ligados.
 */
export async function applyPurchaseOrderReceive(
  admin: Admin,
  tenantId: string,
  orderId: string
): Promise<ReceivePurchaseOrderResult> {
  const { data: order, error: orderErr } = await admin
    .from("purchase_orders")
    .select(
      "id, status, subtotal, freight_cost, insurance_cost, other_costs, total_tax_non_creditable"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderErr) throw new Error(orderErr.message);
  if (!order) throw new Error("Pedido não encontrado");

  const { data: items, error: itemsErr } = await admin
    .from("purchase_order_items")
    .select("id, product_id, quantity, total_price, received_quantity")
    .eq("purchase_order_id", orderId)
    .eq("tenant_id", tenantId);

  if (itemsErr) throw new Error(itemsErr.message);

  const rows = (items ?? []) as PoItem[];
  const subtotal = rows.reduce((s, it) => s + num(it.total_price), 0);
  const totalExtras = purchaseOrderExtrasTotal(order as PoRow);

  let productsCostUpdated = 0;

  for (const item of rows) {
    const qty = num(item.quantity);
    if (qty <= 0) continue;

    let extraForItem = 0;
    if (subtotal > 0 && totalExtras > 0) {
      const share = num(item.total_price) / subtotal;
      extraForItem = totalExtras * share;
    }

    const landedLineTotal = num(item.total_price) + extraForItem;
    const newUnitCost = landedLineTotal / qty;

    await admin
      .from("purchase_order_items")
      .update({
        received_quantity: qty,
      })
      .eq("id", item.id)
      .eq("tenant_id", tenantId);

    if (item.product_id) {
      await recordProductPriceHistory(admin, tenantId, item.product_id, {
        priceType: "purchase",
        value: newUnitCost,
        notes: `Recebimento pedido de compra (${orderId})`,
      });
      productsCostUpdated += 1;
    }
  }

  return {
    itemsUpdated: rows.length,
    productsCostUpdated,
  };
}
