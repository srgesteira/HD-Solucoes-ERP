import type { AdminClient } from "@/modules/vendas/lib/sales/sales-flow";
import { aggregatePurchaseLineTaxes } from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";

export type SalesOrderExtraCosts = {
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total_ipi?: number | null;
};

export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Total = subtotal − desconto + outros impostos + IPI (ICMS informativo no subtotal). */
export function computeSalesOrderTotal(order: SalesOrderExtraCosts): number {
  const subtotal = num(order.subtotal);
  const discount = num(order.discount);
  const tax = num(order.tax);
  const totalIpi = num(order.total_ipi);
  return Math.max(0, subtotal - discount + tax + totalIpi);
}

/** Recalcula totais do cabeçalho a partir dos itens gravados. */
export async function recalculateSalesOrderHeaderTotals(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<{ error?: string }> {
  const { data: items, error: iErr } = await admin
    .from("sales_order_items")
    .select("quantity, unit_price, icms_value, ipi_value, tax_base")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (iErr) return { error: iErr.message };

  const { data: order, error: oErr } = await admin
    .from("sales_orders")
    .select("discount, tax")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (oErr) return { error: oErr.message };
  if (!order) return { error: "Pedido não encontrado" };

  const agg = aggregatePurchaseLineTaxes(
    (items ?? []).map((row) => ({
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      icmsValue: Number(row.icms_value ?? 0),
      ipiValue: Number(row.ipi_value ?? 0),
      taxBase: Number(row.tax_base ?? 0),
    }))
  );

  const total = computeSalesOrderTotal({
    subtotal: agg.subtotal,
    discount: order.discount,
    tax: order.tax,
    total_ipi: agg.totalIpi,
  });

  const { error: upErr } = await admin
    .from("sales_orders")
    .update({
      subtotal: agg.subtotal,
      total_icms: agg.totalIcms,
      total_ipi: agg.totalIpi,
      total_tax_base: agg.totalTaxBase,
      total,
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (upErr) return { error: upErr.message };
  return {};
}
