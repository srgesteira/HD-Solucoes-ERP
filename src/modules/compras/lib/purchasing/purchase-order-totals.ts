export type PurchaseOrderExtraCosts = {
  freight_cost?: number | null;
  insurance_cost?: number | null;
  other_costs?: number | null;
  total_tax_non_creditable?: number | null;
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total_icms?: number | null;
  total_ipi?: number | null;
};

export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function purchaseOrderExtrasTotal(order: PurchaseOrderExtraCosts): number {
  return (
    num(order.freight_cost) +
    num(order.insurance_cost) +
    num(order.other_costs) +
    num(order.total_tax_non_creditable)
  );
}

/**
 * Total do pedido = subtotal − desconto + outros impostos + IPI + custos adicionais.
 * ICMS é informativo (já incluso no subtotal da nota do fornecedor).
 */
export function computePurchaseOrderTotal(order: PurchaseOrderExtraCosts): number {
  const subtotal = num(order.subtotal);
  const discount = num(order.discount);
  const tax = num(order.tax);
  const totalIpi = num(order.total_ipi);
  const extras = purchaseOrderExtrasTotal(order);
  return Math.max(0, subtotal - discount + tax + totalIpi + extras);
}
