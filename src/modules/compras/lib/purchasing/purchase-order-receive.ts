import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { applyInventoryInbound } from "@/modules/almoxarifado/lib/inventory-inbound";
import { INVENTORY_ORIGIN } from "@/modules/almoxarifado/lib/inventory-origins";
import { recordProductPriceHistory } from "@/modules/engenharia/lib/products/product-price-history";
import { propagateComponentCostChange } from "@/modules/engenharia/lib/products/propagate-component-cost";
import { computeLandedUnitCost } from "@/modules/compras/lib/purchasing/landed-unit-cost";
import { num } from "@/modules/compras/lib/purchasing/purchase-order-totals";

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

type Admin = SupabaseClient<Database>;

type PoItem = {
  id: string;
  product_id: string | null;
  quantity: number;
  total_price: number;
  ipi_value: number;
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
  inventoryMovements: number;
};

/**
 * Custo pousado no recebimento:
 * subtotal da linha + IPI da linha + fatia rateada de frete/seguro/outros/imp. não creditáveis.
 * ICMS não entra (embutido no preço; evita duplicar).
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
    .select("id, product_id, quantity, total_price, ipi_value, received_quantity")
    .eq("purchase_order_id", orderId)
    .eq("tenant_id", tenantId);

  if (itemsErr) throw new Error(itemsErr.message);

  const rows = (items ?? []) as PoItem[];
  const orderSubtotal =
    num(order.subtotal) > 0
      ? num(order.subtotal)
      : rows.reduce((s, it) => s + num(it.total_price), 0);

  const orderExtras = {
    freight_cost: order.freight_cost,
    insurance_cost: order.insurance_cost,
    other_costs: order.other_costs,
    total_tax_non_creditable: order.total_tax_non_creditable,
  };

  let productsCostUpdated = 0;
  let inventoryMovements = 0;
  const propagatedProductIds = new Set<string>();

  for (const item of rows) {
    const qty = num(item.quantity);
    if (qty <= 0) continue;

    const prevReceived = num(item.received_quantity);
    const newReceived = qty;
    const delta = round4(newReceived - prevReceived);

    const newUnitCost = computeLandedUnitCost(
      {
        quantity: qty,
        totalPrice: num(item.total_price),
        ipiValue: num(item.ipi_value),
      },
      orderSubtotal,
      orderExtras
    );

    await admin
      .from("purchase_order_items")
      .update({
        received_quantity: newReceived,
      })
      .eq("id", item.id)
      .eq("tenant_id", tenantId);

    if (delta > 0.0001 && item.product_id) {
      const invRes = await applyInventoryInbound(
        admin,
        tenantId,
        item.product_id,
        delta,
        {
          reason: `Recebimento PC (${orderId})`,
          referenceId: item.id,
          origin: INVENTORY_ORIGIN.PURCHASE_RECEIVE,
        }
      );
      if (invRes.error) throw new Error(invRes.error);
      inventoryMovements += 1;
    }

    if (item.product_id) {
      await recordProductPriceHistory(admin, tenantId, item.product_id, {
        priceType: "purchase",
        value: newUnitCost,
        notes: `Recebimento pedido de compra (${orderId}) — custo com IPI e despesas rateadas`,
      });
      productsCostUpdated += 1;
      propagatedProductIds.add(item.product_id);
    }
  }

  for (const productId of propagatedProductIds) {
    await propagateComponentCostChange(admin, tenantId, productId);
  }

  return {
    itemsUpdated: rows.length,
    productsCostUpdated,
    inventoryMovements,
  };
}

/** Exposto para testes e scripts de backfill. */
export function previewLandedUnitCostForItem(
  item: Pick<PoItem, "quantity" | "total_price" | "ipi_value">,
  order: Pick<
    PoRow,
    | "subtotal"
    | "freight_cost"
    | "insurance_cost"
    | "other_costs"
    | "total_tax_non_creditable"
  >,
  itemsSubtotal?: number
): number {
  const orderSubtotal =
    num(order.subtotal) > 0
      ? num(order.subtotal)
      : num(itemsSubtotal ?? 0);
  return computeLandedUnitCost(
    {
      quantity: num(item.quantity),
      totalPrice: num(item.total_price),
      ipiValue: num(item.ipi_value),
    },
    orderSubtotal,
    {
      freight_cost: order.freight_cost,
      insurance_cost: order.insurance_cost,
      other_costs: order.other_costs,
      total_tax_non_creditable: order.total_tax_non_creditable,
    }
  );
}
