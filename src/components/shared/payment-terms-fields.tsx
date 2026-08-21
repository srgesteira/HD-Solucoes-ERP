"use client";

import { useMemo } from "react";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { IntegerInput } from "@/shared/ui/integer-input";
import { Label } from "@/shared/ui/label";
import { formatShortDate, todayIsoSaoPaulo } from "@/shared/utils/date";
import {
  parsePaymentDueMode,
  prefillFixedDueDates,
  type PaymentDueMode,
} from "@/shared/utils/payment-due";
import {
  buildInstallmentDueDates,
  PAYMENT_TERM_LABELS,
} from "@/shared/utils/payment-terms-format";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60 " +
  "dark:bg-slate-950 dark:border-slate-600";

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
  /** Ex.: "data do pedido" — usado só em compras, sem modo de emissão. */
  baseDateLabel?: string;
  /** Vendas/orçamento/faturamento: prazo a partir da NF-e ou datas manuais. */
  showDueMode?: boolean;
  dueMode?: PaymentDueMode;
  onDueModeChange?: (mode: PaymentDueMode) => void;
  fixedDueDates?: string[];
  onFixedDueDatesChange?: (dates: string[]) => void;
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
  showDueMode = false,
  dueMode = "from_emission",
  onDueModeChange,
  fixedDueDates = [],
  onFixedDueDatesChange,
}: Props) {
  const mode = parsePaymentDueMode(dueMode);
  const nInstallments = Math.max(1, parseInt(paymentInstallments, 10) || 1);

  const duePreview = useMemo(() => {
    if (showDueMode && mode === "fixed_dates") {
      return (fixedDueDates ?? []).slice(0, nInstallments);
    }
    const base = showDueMode
      ? todayIsoSaoPaulo()
      : (baseDateIso?.trim().slice(0, 10) ?? "");
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
  }, [
    showDueMode,
    mode,
    fixedDueDates,
    nInstallments,
    baseDateIso,
    paymentInstallments,
    paymentDaysFirst,
    paymentDaysBetween,
  ]);

  const resizeFixedDates = (count: number, current: string[]) => {
    const next = current.slice(0, count);
    while (next.length < count) {
      next.push(duePreview[next.length] ?? todayIsoSaoPaulo());
    }
    return next;
  };

  return (
    <div className="space-y-3">
      {showDueMode ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-due-mode`}>Tipo de vencimento</Label>
          <select
            id={`${idPrefix}-due-mode`}
            className={SELECT_CLASS}
            value={mode}
            disabled={disabled}
            onChange={(e) => {
              const next = parsePaymentDueMode(e.target.value);
              onDueModeChange?.(next);
              if (next === "fixed_dates") {
                onFixedDueDatesChange?.(
                  resizeFixedDates(
                    nInstallments,
                    fixedDueDates.length
                      ? fixedDueDates
                      : prefillFixedDueDates({
                          payment_due_mode: "from_emission",
                          payment_installments: nInstallments,
                          payment_days_to_first_due:
                            parseInt(paymentDaysFirst, 10) || 0,
                          payment_days_between_installments:
                            parseInt(paymentDaysBetween, 10) || 0,
                        })
                  )
                );
              }
              onBlur?.();
            }}
          >
            <option value="from_emission">
              Prazo em dias a partir da emissão da nota
            </option>
            <option value="fixed_dates">Datas específicas de pagamento</option>
          </select>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-installments`}>
            {PAYMENT_TERM_LABELS.installments}
          </Label>
          <IntegerInput
            id={`${idPrefix}-installments`}
            value={parseInt(paymentInstallments, 10) || 0}
            onValueChange={(n) => {
              const next = n > 0 ? String(n) : "";
              onPaymentInstallmentsChange(next);
              if (showDueMode && mode === "fixed_dates") {
                onFixedDueDatesChange?.(
                  resizeFixedDates(Math.max(1, n), fixedDueDates)
                );
              }
            }}
            disabled={disabled}
            onBlur={onBlur}
          />
        </div>
        {showDueMode && mode === "fixed_dates" ? null : (
          <>
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
                  0 dias = 1.ª parcela à vista (na emissão).
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
          </>
        )}
      </div>

      {showDueMode && mode === "fixed_dates" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-800">
            Datas de pagamento (uma por parcela)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: nInstallments }).map((_, i) => (
              <div key={`${idPrefix}-fixed-${i}`} className="space-y-1">
                <Label htmlFor={`${idPrefix}-fixed-${i}`}>
                  Parcela {i + 1}/{nInstallments}
                </Label>
                <BrDateInput
                  id={`${idPrefix}-fixed-${i}`}
                  value={fixedDueDates[i] || null}
                  disabled={disabled}
                  onChange={(iso) => {
                    const next = resizeFixedDates(nInstallments, [
                      ...fixedDueDates,
                    ]);
                    next[i] = iso ?? "";
                    onFixedDueDatesChange?.(next);
                    onBlur?.();
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : duePreview.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <p className="text-xs font-medium text-slate-800 mb-1.5">
            {showDueMode
              ? "Duplicata se a nota for emitida hoje"
              : "Datas de pagamento no financeiro"}
            {showDueMode ? null : (
              <span className="font-normal text-slate-500">
                {" "}
                (a partir da {baseDateLabel})
              </span>
            )}
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
      ) : baseDateIso || showDueMode ? null : (
        <p className="text-[11px] text-amber-800">
          Informe a {baseDateLabel} para ver as datas de vencimento.
        </p>
      )}
    </div>
  );
}
