"use client";

import { useMemo } from "react";
import { IntegerInput } from "@/shared/ui/integer-input";
import { Label } from "@/shared/ui/label";
import { formatShortDate } from "@/shared/utils/date";
import {
  buildInstallmentDueDates,
  PAYMENT_TERM_LABELS,
} from "@/shared/utils/payment-terms-format";

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
  /** Data-base ISO (yyyy-MM-dd) para preview dos vencimentos no financeiro. */
  baseDateIso?: string | null;
  /** Ex.: "data do pedido" */
  baseDateLabel?: string;
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
  baseDateIso,
  baseDateLabel = "data do pedido",
}: Props) {
  const duePreview = useMemo(() => {
    const base = baseDateIso?.trim().slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];
    const n = parseInt(paymentInstallments, 10);
    const d1 = parseInt(paymentDaysFirst, 10);
    const between =
      paymentDaysBetween.trim() === ""
        ? 0
        : parseInt(paymentDaysBetween, 10) || 0;
    if (!Number.isFinite(n) || n < 1) return [];
    if (!Number.isFinite(d1) || d1 < 0) return [];
    return buildInstallmentDueDates({
      baseDateIso: base,
      installments: n,
      daysToFirst: d1,
      daysBetween: between,
    });
  }, [baseDateIso, paymentInstallments, paymentDaysFirst, paymentDaysBetween]);

  return (
    <div className="space-y-3">
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
          {paymentDaysFirst.trim() === "0" ||
          parseInt(paymentDaysFirst, 10) === 0 ? (
            <p className="text-[11px] text-slate-500">
              0 dias = 1.ª parcela à vista.
            </p>
          ) : null}
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

      {duePreview.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <p className="text-xs font-medium text-slate-800 mb-1.5">
            Datas de pagamento no financeiro
            <span className="font-normal text-slate-500">
              {" "}
              (a partir da {baseDateLabel})
            </span>
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
            {duePreview.map((iso, i) => (
              <li key={`${iso}-${i}`} className="tabular-nums">
                <span className="text-slate-500">
                  Parcela {i + 1}/{duePreview.length}:
                </span>{" "}
                <span className="font-medium text-slate-900">
                  {formatShortDate(iso)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : baseDateIso ? null : (
        <p className="text-[11px] text-amber-800">
          Informe a {baseDateLabel} para ver as datas de vencimento.
        </p>
      )}
    </div>
  );
}
