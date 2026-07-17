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

/** 0 dias na 1.ª parcela = pagamento à vista (na emissão / entrega). */
export function isFirstInstallmentAtSight(
  daysToFirst: number | null | undefined
): boolean {
  return daysToFirst === 0;
}

export function formatPaymentTermsSummary(order: PaymentTermsValues): string {
  const n = order.payment_installments ?? 1;
  const d1 = order.payment_days_to_first_due ?? 30;
  const between = order.payment_days_between_installments ?? 0;

  if (n === 1) {
    if (isFirstInstallmentAtSight(d1)) {
      return "Pagamento à vista.";
    }
    return `Pagamento em parcela única (${d1} dias após emissão).`;
  }

  const firstLabel = isFirstInstallmentAtSight(d1)
    ? "1.ª parcela à vista"
    : `vencimento da 1.ª em ${d1} dias`;

  if (between > 0) {
    return `${n} parcelas — ${firstLabel}, intervalo de ${between} dias entre parcelas.`;
  }
  return `${n} parcelas — ${firstLabel}.`;
}

export function resolvePaymentTermsDisplayText(
  freeText: string | null | undefined,
  structured: PaymentTermsValues
): string {
  const t = freeText?.trim();
  if (!t) return formatPaymentTermsSummary(structured);

  // Texto legado com «0 dias» enquanto a estrutura diz à vista → regenera.
  if (
    isFirstInstallmentAtSight(structured.payment_days_to_first_due) &&
    /\b0\s*dias?\b/i.test(t)
  ) {
    return formatPaymentTermsSummary(structured);
  }

  return t;
}

export function formatDaysToFirstDueDisplay(
  days: number | null | undefined
): string {
  if (days == null || !Number.isFinite(days)) return "—";
  if (isFirstInstallmentAtSight(days)) return "0 (à vista)";
  return String(days);
}
