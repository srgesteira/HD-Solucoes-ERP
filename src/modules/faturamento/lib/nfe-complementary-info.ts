import { paymentScheduleBaseDate } from "@/modules/vendas/lib/sales/sales-order-delivery-schedule";
import { formatShortDate } from "@/shared/utils/date";
import { buildInstallmentDueDates } from "@/shared/utils/payment-terms-format";

/**
 * Campos usados na NF-e. Não inclui `sales_orders.notes` —
 * texto livre do pedido é só interno / produção.
 */
export type NfeComplementaryInfoSource = {
  order_number: string;
  customer_po_number: string | null;
  delivery_address_formatted?: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
  actual_delivery: string | null;
  expected_delivery: string | null;
  order_date: string;
};

export function formatNfePaymentDueDates(
  source: NfeComplementaryInfoSource
): string {
  const base = paymentScheduleBaseDate({
    actual_delivery: source.actual_delivery,
    expected_delivery: source.expected_delivery,
    order_date: source.order_date,
  });
  const dates = buildInstallmentDueDates({
    baseDateIso: base,
    installments: source.payment_installments,
    daysToFirst: source.payment_days_to_first_due,
    daysBetween: source.payment_days_between_installments,
  });
  if (!dates.length) return "";
  return dates
    .map((d) => {
      const formatted = formatShortDate(d);
      return formatted === "--" ? d : formatted;
    })
    .join(" · ");
}

/**
 * Informações complementares (texto livre / infCpl).
 * Pedido HD + PC do cliente; endereço de entrega só se diferente
 * (a API Bling v3 POST /nfe não tem grupo estruturado `entrega`).
 */
export function buildNfeComplementaryInfoLines(
  source: Pick<
    NfeComplementaryInfoSource,
    "order_number" | "customer_po_number" | "delivery_address_formatted"
  >
): string[] {
  const po = source.customer_po_number?.trim();
  const delivery = source.delivery_address_formatted?.trim();
  return [
    `Pedido HD ${source.order_number.trim()}`,
    po ? `Pedido de compra do cliente: ${po}` : null,
    delivery ? `Entrega: ${delivery}` : null,
  ].filter((line): line is string => Boolean(line));
}

/** Texto enviado ao Bling em `observacoes`. */
export function buildNfeComplementaryInfo(
  source: Pick<
    NfeComplementaryInfoSource,
    "order_number" | "customer_po_number" | "delivery_address_formatted"
  >
): string {
  return buildNfeComplementaryInfoLines(source).join("\n");
}
