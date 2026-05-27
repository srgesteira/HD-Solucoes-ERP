"use client";

import { IntegerInput } from "@/components/ui/integer-input";
import { Label } from "@/components/ui/label";

type Props = {
  idPrefix?: string;
  paymentInstallments: string;
  onPaymentInstallmentsChange: (value: string) => void;
  paymentDaysFirst: string;
  onPaymentDaysFirstChange: (value: string) => void;
  paymentDaysBetween: string;
  onPaymentDaysBetweenChange: (value: string) => void;
  disabled?: boolean;
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
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-installments`}>Parcelas</Label>
        <IntegerInput
          id={`${idPrefix}-installments`}
          value={parseInt(paymentInstallments, 10) || 0}
          onValueChange={(n) =>
            onPaymentInstallmentsChange(n > 0 ? String(n) : "")
          }
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-days-first`}>Dias até 1.ª parcela</Label>
        <IntegerInput
          id={`${idPrefix}-days-first`}
          value={parseInt(paymentDaysFirst, 10) || 0}
          onValueChange={(n) => onPaymentDaysFirstChange(String(n))}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-days-between`}>
          Dias entre parcelas{" "}
          <span className="text-slate-400 font-normal">(opcional)</span>
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
        />
        <p className="text-xs text-slate-500">Deixe vazio para usar 0.</p>
      </div>
    </div>
  );
}
