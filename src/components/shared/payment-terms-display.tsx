import {
  PAYMENT_TERM_LABELS,
  formatDaysToFirstDueDisplay,
  type PaymentTermsValues,
} from "@/shared/utils/payment-terms-format";
import { fmtBRL } from "@/shared/utils/format-brl";
import {
  resolveInstallmentAmounts,
  storedInstallmentAmounts,
} from "@/shared/utils/payment-installment-amounts";

type Props = PaymentTermsValues & {
  className?: string;
};

function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

export function PaymentTermsDisplay({
  payment_installments,
  payment_days_to_first_due,
  payment_days_between_installments,
  payment_installment_amounts,
  total,
  className,
}: Props) {
  const n = Math.max(1, payment_installments ?? 1);
  const amounts =
    total != null && Number(total) > 0
      ? resolveInstallmentAmounts(
          Number(total),
          n,
          storedInstallmentAmounts(payment_installment_amounts)
        )
      : storedInstallmentAmounts(payment_installment_amounts);

  return (
    <div
      className={
        className ??
        "grid gap-4 sm:grid-cols-3 text-sm"
      }
    >
      <div>
        <p className="text-slate-500">{PAYMENT_TERM_LABELS.installments}</p>
        <p className="font-medium tabular-nums">
          {fmt(payment_installments)}
        </p>
      </div>
      <div>
        <p className="text-slate-500">{PAYMENT_TERM_LABELS.daysToFirst}</p>
        <p className="font-medium tabular-nums">
          {formatDaysToFirstDueDisplay(payment_days_to_first_due)}
        </p>
      </div>
      <div>
        <p className="text-slate-500">{PAYMENT_TERM_LABELS.daysBetween}</p>
        <p className="font-medium tabular-nums">
          {fmt(payment_days_between_installments)}
        </p>
      </div>
      {amounts.length === n ? (
        <div className="sm:col-span-3">
          <p className="text-slate-500 mb-1">Valores</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {amounts.map((v, i) => (
              <li key={`amt-${i}`} className="tabular-nums">
                <span className="text-slate-500">
                  {i + 1}/{n}:
                </span>{" "}
                <span className="font-medium">{fmtBRL(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
