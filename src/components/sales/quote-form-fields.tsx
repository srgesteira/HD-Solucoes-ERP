"use client";

import { useMemo } from "react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { parsePaymentTermsFromText } from "@/modules/vendas/lib/sales/parse-payment-terms";
import { formatDeliveryBusinessDaysLabel } from "@/modules/vendas/lib/sales/quote-delivery";
import { computeValidUntil, QUOTE_SHIPPING_TYPES } from "@/modules/vendas/lib/sales/quote-validity";
import { addBusinessDays } from "@/shared/utils/date";
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
  paymentTerms: string;
  onPaymentTermsChange: (value: string) => void;
  deliveryBusinessDays: string;
  onDeliveryBusinessDaysChange: (value: string) => void;
  shippingType: string;
  onShippingTypeChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  showProductDescriptions: boolean;
  onShowProductDescriptionsChange: (value: boolean) => void;
  seedCustomer?: CustomerOption | null;
  quoteNumberReadOnly?: boolean;
}

function formatDay(iso: string): string {
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

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
  paymentTerms,
  onPaymentTermsChange,
  deliveryBusinessDays,
  onDeliveryBusinessDaysChange,
  shippingType,
  onShippingTypeChange,
  notes,
  onNotesChange,
  showProductDescriptions,
  onShowProductDescriptionsChange,
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

  const parsedPayment = useMemo(
    () => parsePaymentTermsFromText(paymentTerms),
    [paymentTerms]
  );

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
    <div className="space-y-6">
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
          <Input
            id="quote-date"
            type="date"
            value={quoteDate}
            onChange={(e) => onQuoteDateChange(e.target.value)}
            required
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

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-payment-terms">Condições de pagamento</Label>
          <Input
            id="quote-payment-terms"
            value={paymentTerms}
            onChange={(e) => onPaymentTermsChange(e.target.value)}
            placeholder="Ex.: 28ddf, 30/60/90 ou À vista"
          />
          {parsedPayment ? (
            <p className="text-xs text-slate-500">
              Interpretado:{" "}
              <span className="font-medium text-slate-700">
                {parsedPayment.installments === 1
                  ? `1 parcela em ${parsedPayment.daysToFirstDue} dias`
                  : `${parsedPayment.installments} parcelas (${parsedPayment.daysToFirstDue} dias até a 1.ª, depois a cada ${parsedPayment.daysBetweenInstallments} dias)`}
              </span>
            </p>
          ) : paymentTerms.trim() ? (
            <p className="text-xs text-slate-500">
              Texto livre — será guardado como informado no orçamento.
            </p>
          ) : null}
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
            onChange={(e) => onShippingTypeChange(e.target.value)}
          >
            {QUOTE_SHIPPING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-notes">Observações</Label>
          <Textarea
            id="quote-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={4}
            placeholder="Notas internas ou condições que apareçam junto ao orçamento…"
            className="resize-y min-h-[88px]"
          />
        </div>

        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
          <label
            htmlFor="quote-show-product-descriptions"
            className="flex items-start gap-3 cursor-pointer"
          >
            <input
              id="quote-show-product-descriptions"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
              checked={showProductDescriptions}
              onChange={(e) =>
                onShowProductDescriptionsChange(e.target.checked)
              }
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                Incluir descrição dos produtos na impressão
              </span>
              <span className="block text-xs text-slate-500 leading-relaxed">
                Quando activo, a impressão/PDF mostra a descrição técnica
                cadastrada em cada produto. As observações por item para o
                cliente aparecem sempre.
              </span>
            </span>
          </label>
        </div>
      </div>

    </div>
  );
}
