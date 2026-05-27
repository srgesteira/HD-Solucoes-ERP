"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import { computeValidUntil, QUOTE_SHIPPING_TYPES } from "@/modules/vendas/lib/sales/quote-validity";
import {
  CustomerQuickCreateModal,
  type CustomerOption,
} from "@/components/sales/customer-quick-create-modal";
import {
  CUSTOMERS_QUERY_KEY,
  customersQuoteFormQueryKey,
} from "@/modules/vendas/lib/customers/query-keys";

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
  expectedDeliveryDate: string;
  onExpectedDeliveryDateChange: (value: string) => void;
  paymentInstallments: string;
  onPaymentInstallmentsChange: (value: string) => void;
  paymentDaysFirst: string;
  onPaymentDaysFirstChange: (value: string) => void;
  paymentDaysBetween: string;
  onPaymentDaysBetweenChange: (value: string) => void;
  deliveryDeadline: string;
  onDeliveryDeadlineChange: (value: string) => void;
  shippingType: string;
  onShippingTypeChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  customerSearch?: string;
  onCustomerSearchChange?: (value: string) => void;
  seedCustomer?: CustomerOption | null;
  quoteNumberReadOnly?: boolean;
}

async function fetchCustomers(search: string): Promise<CustomerOption[]> {
  const params = new URLSearchParams({
    is_active: "true",
    page: "1",
    limit: "100",
  });
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/customers?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CustomerOption[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar clientes");
  }
  return json.data ?? [];
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
  expectedDeliveryDate,
  onExpectedDeliveryDateChange,
  paymentInstallments,
  onPaymentInstallmentsChange,
  paymentDaysFirst,
  onPaymentDaysFirstChange,
  paymentDaysBetween,
  onPaymentDaysBetweenChange,
  deliveryDeadline,
  onDeliveryDeadlineChange,
  shippingType,
  onShippingTypeChange,
  notes,
  onNotesChange,
  customerSearch: customerSearchProp,
  onCustomerSearchChange,
  seedCustomer,
  quoteNumberReadOnly = false,
}: QuoteHeaderFormProps) {
  const queryClient = useQueryClient();
  const [localSearch, setLocalSearch] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  /** Clientes criados nesta sessão — garantem presença no select antes do refetch. */
  const [pinnedCustomers, setPinnedCustomers] = useState<CustomerOption[]>([]);

  const customerSearch =
    customerSearchProp !== undefined ? customerSearchProp : localSearch;
  const setCustomerSearch =
    onCustomerSearchChange ?? ((v: string) => setLocalSearch(v));

  const customersQuery = useQuery({
    queryKey: customersQuoteFormQueryKey(customerSearch),
    queryFn: () => fetchCustomers(customerSearch),
    staleTime: 0,
  });

  const customers = useMemo(() => {
    const map = new Map<string, CustomerOption>();
    for (const c of pinnedCustomers) {
      if (c.id) map.set(c.id, c);
    }
    if (seedCustomer?.id) map.set(seedCustomer.id, seedCustomer);
    for (const c of customersQuery.data ?? []) {
      if (c.id) map.set(c.id, c);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [customersQuery.data, seedCustomer, pinnedCustomers]);

  const customerIdInOptions = useMemo(
    () => Boolean(customerId && customers.some((c) => c.id === customerId)),
    [customerId, customers]
  );

  const orphanCustomerLabel = useMemo(() => {
    if (!customerId) return "Cliente selecionado";
    const found = customers.find((c) => c.id === customerId);
    return found?.name ?? "Cliente selecionado";
  }, [customerId, customers]);

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

  useEffect(() => {
    if (!customerId) {
      onCustomerSelected?.(null);
      return;
    }
    const c = customers.find((x) => x.id === customerId);
    if (c) onCustomerSelected?.(c);
  }, [customerId, customers, onCustomerSelected]);

  const handleCustomerChange = (id: string) => {
    onCustomerIdChange(id);
    const c = customers.find((x) => x.id === id);
    if (c?.email?.trim() && !clientEmail.trim()) {
      onClientEmailChange(c.email.trim());
    }
    onCustomerSelected?.(c ?? null);
  };

  const handleCustomerCreated = useCallback(
    async (c: CustomerOption) => {
      setPinnedCustomers((prev) => {
        if (prev.some((x) => x.id === c.id)) return prev;
        return [c, ...prev];
      });
      setCustomerSearch("");
      onCustomerIdChange(c.id);
      if (c.email?.trim() && !clientEmail.trim()) {
        onClientEmailChange(c.email.trim());
      }
      onCustomerSelected?.(c);
      await queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      await customersQuery.refetch();
    },
    [
      queryClient,
      customersQuery,
      onCustomerIdChange,
      onClientEmailChange,
      onCustomerSelected,
      clientEmail,
      setCustomerSearch,
    ]
  );

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

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-customer-search">Cliente *</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <Input
                id="quote-customer-search"
                className="pl-9"
                placeholder="Pesquisar cliente…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setQuickOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Novo cliente
            </Button>
          </div>
          <select
            id="quote-customer"
            className={cn(SELECT_CLASS, "mt-2")}
            value={customerId}
            onChange={(e) => {
              const next = e.target.value;
              if (
                !next &&
                customerId &&
                (customersQuery.isLoading || customersQuery.isFetching)
              ) {
                return;
              }
              handleCustomerChange(next);
            }}
            required
            disabled={customersQuery.isLoading && !customerId}
          >
            <option value="">— Selecione o cliente —</option>
            {customerId && !customerIdInOptions ? (
              <option value={customerId}>{orphanCustomerLabel}</option>
            ) : null}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.document ? ` (${c.document})` : ""}
              </option>
            ))}
          </select>
          {customersQuery.isError ? (
            <p className="text-xs text-red-600">
              {customersQuery.error instanceof Error
                ? customersQuery.error.message
                : "Erro ao carregar clientes."}
            </p>
          ) : null}
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
            placeholder="Ex.: 30/60/90 dias ou À vista"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-payment-installments">Parcelas</Label>
          <Input
            id="quote-payment-installments"
            type="number"
            min={1}
            value={paymentInstallments}
            onChange={(e) => onPaymentInstallmentsChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-payment-days-first">Dias até 1.ª parcela</Label>
          <Input
            id="quote-payment-days-first"
            type="number"
            min={0}
            value={paymentDaysFirst}
            onChange={(e) => onPaymentDaysFirstChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-payment-days-between">Dias entre parcelas</Label>
          <Input
            id="quote-payment-days-between"
            type="number"
            min={0}
            value={paymentDaysBetween}
            onChange={(e) => onPaymentDaysBetweenChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-expected-delivery">Entrega prevista (data)</Label>
          <Input
            id="quote-expected-delivery"
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => onExpectedDeliveryDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-delivery-deadline">Prazo de entrega (texto livre)</Label>
          <Input
            id="quote-delivery-deadline"
            value={deliveryDeadline}
            onChange={(e) => onDeliveryDeadlineChange(e.target.value)}
            placeholder="Ex.: 15 dias úteis após confirmação"
          />
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
      </div>

      <CustomerQuickCreateModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCustomerCreated={(c) => void handleCustomerCreated(c)}
      />
    </div>
  );
}
