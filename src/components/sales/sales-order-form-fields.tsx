"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { IntegerInput } from "@/shared/ui/integer-input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
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

export type SalesOrderFormFieldsProps = {
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerSelected?: (customer: CustomerOption | null) => void;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  expectedDelivery: string;
  onExpectedDeliveryChange: (value: string) => void;
  paymentInstallments: string;
  onPaymentInstallmentsChange: (value: string) => void;
  paymentDaysFirst: string;
  onPaymentDaysFirstChange: (value: string) => void;
  paymentDaysBetween: string;
  onPaymentDaysBetweenChange: (value: string) => void;
  seedCustomer?: CustomerOption | null;
  disabled?: boolean;
};

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

export function SalesOrderFormFields({
  customerId,
  onCustomerIdChange,
  onCustomerSelected,
  clientEmail,
  onClientEmailChange,
  expectedDelivery,
  onExpectedDeliveryChange,
  paymentInstallments,
  onPaymentInstallmentsChange,
  paymentDaysFirst,
  onPaymentDaysFirstChange,
  paymentDaysBetween,
  onPaymentDaysBetweenChange,
  seedCustomer,
  disabled = false,
}: SalesOrderFormFieldsProps) {
  const queryClient = useQueryClient();
  const [localSearch, setLocalSearch] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: customersQuoteFormQueryKey(localSearch),
    queryFn: () => fetchCustomers(localSearch),
    staleTime: 30_000,
  });

  const customers = useMemo(() => {
    const map = new Map<string, CustomerOption>();
    if (seedCustomer?.id) map.set(seedCustomer.id, seedCustomer);
    for (const c of customersQuery.data ?? []) map.set(c.id, c);
    return [...map.values()];
  }, [customersQuery.data, seedCustomer]);

  const customerIdInOptions = useMemo(
    () => Boolean(customerId && customers.some((c) => c.id === customerId)),
    [customerId, customers]
  );

  const orphanCustomerLabel = useMemo(() => {
    if (!customerId) return "Cliente selecionado";
    const found = customers.find((c) => c.id === customerId);
    return found?.name ?? seedCustomer?.name ?? "Cliente do pedido";
  }, [customerId, customers, seedCustomer]);

  const handleCustomerChange = useCallback(
    (id: string) => {
      onCustomerIdChange(id);
      const c = customers.find((x) => x.id === id);
      if (c) {
        onClientEmailChange(c.email ?? "");
        onCustomerSelected?.(c);
      } else {
        onCustomerSelected?.(null);
      }
    },
    [customers, onCustomerIdChange, onClientEmailChange, onCustomerSelected]
  );

  useEffect(() => {
    if (!customerId) {
      onCustomerSelected?.(null);
      return;
    }
    const c = customers.find((x) => x.id === customerId);
    if (c) onCustomerSelected?.(c);
  }, [customerId, customers, onCustomerSelected]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="so-customer-search">
            Cliente <span className="text-red-600">*</span>
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <Input
                id="so-customer-search"
                className="pl-9"
                placeholder="Pesquisar cliente…"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                disabled={disabled}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={disabled}
              onClick={() => setQuickOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Novo cliente
            </Button>
          </div>
          <select
            id="so-customer"
            className={cn(SELECT_CLASS, "mt-2")}
            value={customerId}
            required
            disabled={disabled || (customersQuery.isLoading && !customerId)}
            onChange={(e) => handleCustomerChange(e.target.value)}
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
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="so-client-email">E-mail do cliente</Label>
          <Input
            id="so-client-email"
            type="email"
            value={clientEmail}
            onChange={(e) => onClientEmailChange(e.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="so-expected-delivery">
            Prazo de entrega ao cliente{" "}
            <span className="text-red-600">*</span>
          </Label>
          <p className="text-xs text-slate-500">
            Obrigatório para o planeamento PCP (coluna Prazo Vendas).
          </p>
          <Input
            id="so-expected-delivery"
            type="date"
            required
            value={expectedDelivery}
            onChange={(e) => onExpectedDeliveryChange(e.target.value)}
            disabled={disabled}
            className="max-w-xs"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="so-payment-installments">Parcelas</Label>
          <IntegerInput
            id="so-payment-installments"
            value={parseInt(paymentInstallments, 10) || 1}
            onValueChange={(n) => onPaymentInstallmentsChange(String(n))}
            disabled={disabled}
            className="max-w-[8rem]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="so-payment-days-first">Dias até 1.ª parcela</Label>
          <IntegerInput
            id="so-payment-days-first"
            value={parseInt(paymentDaysFirst, 10) || 0}
            onValueChange={(n) => onPaymentDaysFirstChange(String(n))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="so-payment-days-between">
            Dias entre parcelas{" "}
            <span className="text-slate-400 font-normal">(opcional)</span>
          </Label>
          <IntegerInput
            id="so-payment-days-between"
            value={parseInt(paymentDaysBetween, 10) || 0}
            onValueChange={(n) => onPaymentDaysBetweenChange(String(n))}
            disabled={disabled}
            placeholder="0"
          />
          <p className="text-xs text-slate-500">Deixe vazio para usar 0.</p>
        </div>
      </div>

      <CustomerQuickCreateModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={async (c) => {
          onCustomerIdChange(c.id);
          onClientEmailChange(c.email ?? "");
          onCustomerSelected?.(c);
          await queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
          await customersQuery.refetch();
        }}
      />
    </div>
  );
}
