export const PAYMENT_TERM_LABELS = {
  installments: "N.º de parcelas",
  daysToFirst: "Vencimento 1.ª parcela (dias)",
  daysBetween: "Intervalo entre parcelas (dias)",
} as const;

export type PaymentTermsValues = {
  payment_installments?: number | null;
  payment_days_to_first_due?: number | null;
  payment_days_between_installments?: number | null;
};

export function formatPaymentTermsSummary(order: PaymentTermsValues): string {
  const n = order.payment_installments ?? 1;
  const d1 = order.payment_days_to_first_due ?? 30;
  const between = order.payment_days_between_installments ?? 0;
  if (n === 1) {
    return `Pagamento em parcela única (${d1} dias após emissão).`;
  }
  if (between > 0) {
    return `${n} parcelas — vencimento da 1.ª em ${d1} dias, intervalo de ${between} dias entre parcelas.`;
  }
  return `${n} parcelas — vencimento da 1.ª em ${d1} dias.`;
}

export function resolvePaymentTermsDisplayText(
  freeText: string | null | undefined,
  structured: PaymentTermsValues
): string {
  const t = freeText?.trim();
  if (t) return t;
  return formatPaymentTermsSummary(structured);
}
