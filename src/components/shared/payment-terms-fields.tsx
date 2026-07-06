"use client";

import { IntegerInput } from "@/shared/ui/integer-input";
import { Label } from "@/shared/ui/label";
import { PAYMENT_TERM_LABELS } from "@/shared/utils/payment-terms-format";

type Props = {
  idPrefix?: string;
  paymentInstallments: string;
  onPaymentInstallmentsChange: (value: string) => void;
  paymentDaysFirst: string;
  onPaymentDaysFirstChange: (value: string) => void;
  paymentDaysBetween: string;
  onPaymentDaysBetweenChange: (value: string) => void;
  disabled?: boolean;
  onBlur?: () => void;
};

export function PaymentTermsFields({
  idPrefix = "payment",
  paymentInstallments,
  onPaymentInstallmentsChange,
  paymentDaysFirst,
  onPaymentDaysFirstChange,
  paymentDaysBetween,
  onPaymentDaysBetweenChange,
  disabled = false,
  onBlur,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-installments`}>
          {PAYMENT_TERM_LABELS.installments}
        </Label>
        <IntegerInput
          id={`${idPrefix}-installments`}
          value={parseInt(paymentInstallments, 10) || 0}
          onValueChange={(n) =>
            onPaymentInstallmentsChange(n > 0 ? String(n) : "")
          }
          disabled={disabled}
          onBlur={onBlur}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-days-first`}>
          {PAYMENT_TERM_LABELS.daysToFirst}
        </Label>
        <IntegerInput
          id={`${idPrefix}-days-first`}
          value={parseInt(paymentDaysFirst, 10) || 0}
          onValueChange={(n) => onPaymentDaysFirstChange(String(n))}
          disabled={disabled}
          onBlur={onBlur}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-days-between`}>
          {PAYMENT_TERM_LABELS.daysBetween}
        </Label>
        <IntegerInput
          id={`${idPrefix}-days-between`}
          value={
            paymentDaysBetween.trim() === ""
              ? 0
              : parseInt(paymentDaysBetween, 10) || 0
          }
          onValueChange={(n) =>
            onPaymentDaysBetweenChange(n > 0 ? String(n) : "")
          }
          disabled={disabled}
          placeholder="0"
          onBlur={onBlur}
        />
      </div>
    </div>
  );
}
