"use client";

import { useMemo } from "react";
import { Input } from "@/shared/ui/input";
import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import { NumericInput } from "@/shared/ui/numeric-input";
import { PaymentTermsFields } from "@/components/shared/payment-terms-fields";
import { formatDeliveryBusinessDaysLabel } from "@/modules/vendas/lib/sales/quote-delivery";
import { computeValidUntil, QUOTE_SHIPPING_TYPES } from "@/modules/vendas/lib/sales/quote-validity";
import { addBusinessDays, formatShortDate } from "@/shared/utils/date";
import type { CustomerOption } from "@/components/sales/customer-quick-create-modal";
import { CustomerSearchField } from "@/components/sales/customer-search-field";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-60 " +
  "dark:bg-slate-950 dark:border-slate-600";

export interface QuoteHeaderFormProps {
  quoteNumber: string;
  onQuoteNumberChange: (value: string) => void;
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerSelected?: (customer: CustomerOption | null) => void;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  quoteDate: string;
  onQuoteDateChange: (value: string) => void;
  validityDays: string;
  onValidityDaysChange: (value: string) => void;
  seedCustomer?: CustomerOption | null;
  quoteNumberReadOnly?: boolean;
}

export interface QuoteCommercialFormProps {
  paymentInstallments: string;
  onPaymentInstallmentsChange: (value: string) => void;
  paymentDaysFirst: string;
  onPaymentDaysFirstChange: (value: string) => void;
  paymentDaysBetween: string;
  onPaymentDaysBetweenChange: (value: string) => void;
  deliveryBusinessDays: string;
  onDeliveryBusinessDaysChange: (value: string) => void;
  shippingType: string;
  onShippingTypeChange: (value: string) => void;
  freightCost: number;
  onFreightCostChange: (value: number) => void;
  quoteDate: string;
}

function formatDay(iso: string): string {
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

/** Dados do orçamento: número, cliente, datas (sem pagamento nem obs). */
export function QuoteFormFields({
  quoteNumber,
  onQuoteNumberChange,
  customerId,
  onCustomerIdChange,
  onCustomerSelected,
  clientEmail,
  onClientEmailChange,
  quoteDate,
  onQuoteDateChange,
  validityDays,
  onValidityDaysChange,
  seedCustomer,
  quoteNumberReadOnly = false,
}: QuoteHeaderFormProps) {
  const computedValidUntil = useMemo(() => {
    const days = parseInt(String(validityDays).trim(), 10);
    const qd = quoteDate.trim();
    if (!qd || !Number.isFinite(days) || days < 1) return "";
    try {
      return computeValidUntil(qd, days);
    } catch {
      return "";
    }
  }, [quoteDate, validityDays]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="quote-number">Número do orçamento *</Label>
        <Input
          id="quote-number"
          value={quoteNumber}
          onChange={(e) => onQuoteNumberChange(e.target.value)}
          placeholder="ORC-2026-0001"
          required
          autoComplete="off"
          readOnly={quoteNumberReadOnly}
          disabled={quoteNumberReadOnly}
          className={quoteNumberReadOnly ? "bg-slate-50 dark:bg-slate-900" : undefined}
        />
      </div>

      <div className="md:col-span-2">
        <CustomerSearchField
          customerId={customerId}
          onCustomerIdChange={onCustomerIdChange}
          onCustomerSelected={onCustomerSelected}
          clientEmail={clientEmail}
          onClientEmailChange={onClientEmailChange}
          seedCustomer={seedCustomer}
          inputId="quote-customer-search"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="quote-client-email">E-mail (envio do orçamento)</Label>
        <Input
          id="quote-client-email"
          type="email"
          value={clientEmail}
          onChange={(e) => onClientEmailChange(e.target.value)}
          placeholder="email@exemplo.pt"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quote-date">Data do orçamento *</Label>
        <BrDateInput
          id="quote-date"
          value={quoteDate || null}
          onChange={(iso) => onQuoteDateChange(iso ?? "")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quote-validity-days">Validade (dias) *</Label>
        <Input
          id="quote-validity-days"
          type="number"
          min={1}
          step={1}
          value={validityDays}
          onChange={(e) => onValidityDaysChange(e.target.value)}
          required
        />
        {computedValidUntil ? (
          <p className="text-xs text-slate-500">
            Válido até:{" "}
            <span className="font-medium text-slate-700 tabular-nums">
              {formatDay(computedValidUntil)}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Condições comerciais: pagamento, prazo de entrega, frete. */
export function QuoteCommercialFields({
  paymentInstallments,
  onPaymentInstallmentsChange,
  paymentDaysFirst,
  onPaymentDaysFirstChange,
  paymentDaysBetween,
  onPaymentDaysBetweenChange,
  deliveryBusinessDays,
  onDeliveryBusinessDaysChange,
  shippingType,
  onShippingTypeChange,
  freightCost,
  onFreightCostChange,
  quoteDate,
}: QuoteCommercialFormProps) {
  const computedDeliveryDate = useMemo(() => {
    const qd = quoteDate.trim().slice(0, 10);
    const n = parseInt(String(deliveryBusinessDays).trim(), 10);
    if (!qd || !/^\d{4}-\d{2}-\d{2}$/.test(qd) || !Number.isFinite(n) || n < 1) {
      return "";
    }
    try {
      return addBusinessDays(qd, n);
    } catch {
      return "";
    }
  }, [quoteDate, deliveryBusinessDays]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2 md:col-span-2">
        <Label>Condições de pagamento</Label>
        <PaymentTermsFields
          idPrefix="quote-payment"
          paymentInstallments={paymentInstallments}
          onPaymentInstallmentsChange={onPaymentInstallmentsChange}
          paymentDaysFirst={paymentDaysFirst}
          onPaymentDaysFirstChange={onPaymentDaysFirstChange}
          paymentDaysBetween={paymentDaysBetween}
          onPaymentDaysBetweenChange={onPaymentDaysBetweenChange}
          baseDateIso={quoteDate}
          baseDateLabel="data do orçamento"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="quote-delivery-business-days">
          Prazo de entrega (dias úteis)
        </Label>
        <Input
          id="quote-delivery-business-days"
          type="number"
          min={1}
          step={1}
          value={deliveryBusinessDays}
          onChange={(e) => onDeliveryBusinessDaysChange(e.target.value)}
          placeholder="Ex.: 15"
        />
        {computedDeliveryDate ? (
          <p className="text-xs text-slate-500">
            {formatDeliveryBusinessDaysLabel(
              parseInt(deliveryBusinessDays.trim(), 10)
            )}
            {" — "}
            entrega prevista em{" "}
            <span className="font-medium text-slate-700 tabular-nums">
              {formatDay(computedDeliveryDate)}
            </span>
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="quote-shipping-type">Tipo de frete</Label>
        <select
          id="quote-shipping-type"
          className={SELECT_CLASS}
          value={shippingType}
          onChange={(e) => {
            const next = e.target.value;
            onShippingTypeChange(next);
            if (next !== "CIF") onFreightCostChange(0);
          }}
        >
          {QUOTE_SHIPPING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {shippingType === "CIF" ? (
        <div className="space-y-2">
          <Label htmlFor="quote-freight-cost">Valor do frete (CIF)</Label>
          <NumericInput
            id="quote-freight-cost"
            value={freightCost}
            onChange={onFreightCostChange}
            maxDecimals={2}
            placeholder="0,00"
          />
          <p className="text-xs text-slate-500">
            Opcional. Se informado, entra no total do orçamento.
          </p>
        </div>
      ) : null}
    </div>
  );
}
