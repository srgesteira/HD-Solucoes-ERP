import {
  PAYMENT_TERM_LABELS,
  type PaymentTermsValues,
} from "@/shared/utils/payment-terms-format";

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
  className,
}: Props) {
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
          {fmt(payment_days_to_first_due)}
        </p>
      </div>
      <div>
        <p className="text-slate-500">{PAYMENT_TERM_LABELS.daysBetween}</p>
        <p className="font-medium tabular-nums">
          {fmt(payment_days_between_installments)}
        </p>
      </div>
    </div>
  );
}
