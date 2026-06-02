import {
  num,
  purchaseOrderExtrasTotal,
  type PurchaseOrderExtraCosts,
} from "@/modules/compras/lib/purchasing/purchase-order-totals";

/** Arredondamento alinhado a NUMERIC(14,4) de custo. */
export function roundUnitCost(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

export type LandedPurchaseLineInput = {
  quantity: number;
  /** Subtotal da linha (qty × unit_price), sem IPI. */
  totalPrice: number;
  /** IPI destacado na linha (R$). */
  ipiValue: number;
};

/**
 * Fatia das despesas gerais do pedido (frete, seguro, outros, imp. não creditáveis)
 * proporcional ao subtotal da linha.
 */
export function computeLineGeneralExtrasShare(
  lineTotalPrice: number,
  orderSubtotal: number,
  orderExtras: PurchaseOrderExtraCosts
): number {
  const subtotal = num(orderSubtotal);
  const extras = purchaseOrderExtrasTotal(orderExtras);
  if (subtotal <= 0 || extras <= 0) return 0;
  const lineBase = num(lineTotalPrice);
  return roundUnitCost((lineBase / subtotal) * extras);
}

/** Custo total da linha (mercadoria + IPI da linha + fatia de despesas gerais). ICMS não entra. */
export function computeLandedLineTotal(
  line: LandedPurchaseLineInput,
  orderSubtotal: number,
  orderExtras: PurchaseOrderExtraCosts
): number {
  const share = computeLineGeneralExtrasShare(
    line.totalPrice,
    orderSubtotal,
    orderExtras
  );
  return roundUnitCost(
    num(line.totalPrice) + num(line.ipiValue) + share
  );
}

/**
 * Custo unitário real para gravar em products.cost_price no recebimento.
 * unit_price + (ipi/qty) + (fatia despesas gerais / qty)
 */
export function computeLandedUnitCost(
  line: LandedPurchaseLineInput,
  orderSubtotal: number,
  orderExtras: PurchaseOrderExtraCosts
): number {
  const qty = num(line.quantity);
  if (qty <= 0) return 0;
  return roundUnitCost(
    computeLandedLineTotal(line, orderSubtotal, orderExtras) / qty
  );
}
