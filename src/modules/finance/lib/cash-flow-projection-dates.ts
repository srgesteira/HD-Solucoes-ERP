import { addDaysToISODate } from "@/modules/vendas/lib/sales/sales-flow";

export type OrderPaymentTerms = {
  expected_delivery: string | null;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
};

export type ProvisionalProjectionResult = {
  date: string | null;
  usedFallback: boolean;
};

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Data de fluxo para título provisório: entrega prevista + prazo de pagamento por parcela.
 * Sem entrega prevista → degrada para due_date do título.
 */
export function provisionalCashFlowDate(
  order: OrderPaymentTerms | null | undefined,
  installmentIndex: number | null | undefined,
  fallbackDueDate: string | null | undefined
): ProvisionalProjectionResult {
  const fallback = dayKey(fallbackDueDate);
  const delivery = dayKey(order?.expected_delivery);
  if (!delivery) {
    return { date: fallback, usedFallback: true };
  }

  const idx = Math.max(1, installmentIndex ?? 1);
  const firstDays = order?.payment_days_to_first_due ?? 30;
  const betweenDays = order?.payment_days_between_installments ?? 0;

  let due = addDaysToISODate(delivery, firstDays);
  for (let i = 2; i <= idx; i++) {
    due = addDaysToISODate(due, betweenDays);
  }

  return { date: due, usedFallback: false };
}

export function cashFlowDateForReceivableOrPayable(
  isForecast: boolean,
  order: OrderPaymentTerms | null | undefined,
  installmentIndex: number | null | undefined,
  dueDate: string | null | undefined
): ProvisionalProjectionResult {
  if (!isForecast) {
    return { date: dayKey(dueDate), usedFallback: false };
  }
  return provisionalCashFlowDate(order, installmentIndex, dueDate);
}
