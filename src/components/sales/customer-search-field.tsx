"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
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

async function fetchCustomers(search: string): Promise<CustomerOption[]> {
  const params = new URLSearchParams({
    is_active: "true",
    page: "1",
    limit: "500",
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

function formatCustomerLabel(c: CustomerOption): string {
  return c.document?.trim() ? `${c.name} (${c.document})` : c.name;
}

export type CustomerSearchFieldProps = {
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerSelected?: (customer: CustomerOption | null) => void;
  clientEmail?: string;
  onClientEmailChange?: (email: string) => void;
  seedCustomer?: CustomerOption | null;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  inputId?: string;
  showQuickCreate?: boolean;
};

export function CustomerSearchField({
  customerId,
  onCustomerIdChange,
  onCustomerSelected,
  clientEmail = "",
  onClientEmailChange,
  seedCustomer,
  disabled = false,
  label = "Cliente",
  required = true,
  inputId = "customer-search",
  showQuickCreate = true,
}: CustomerSearchFieldProps) {
  const queryClient = useQueryClient();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [customerInput, setCustomerInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [pinnedCustomers, setPinnedCustomers] = useState<CustomerOption[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(customerInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [customerInput]);

  const customersQuery = useQuery({
    queryKey: customersQuoteFormQueryKey(debouncedSearch),
    queryFn: () => fetchCustomers(debouncedSearch),
    staleTime: 0,
    enabled: pickerOpen && debouncedSearch.length >= 1,
  });

  const selectedCustomer = useMemo(() => {
    if (!customerId) return null;
    return (
      pinnedCustomers.find((c) => c.id === customerId) ??
      (seedCustomer?.id === customerId ? seedCustomer : null) ??
      (customersQuery.data ?? []).find((c) => c.id === customerId) ??
      null
    );
  }, [customerId, pinnedCustomers, seedCustomer, customersQuery.data]);

  const searchResults = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return [];
    const matchesQuery = (c: CustomerOption) => {
      const hay = `${c.name} ${c.document ?? ""} ${c.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    };
    const map = new Map<string, CustomerOption>();
    for (const c of customersQuery.data ?? []) {
      if (c.id) map.set(c.id, c);
    }
    for (const c of pinnedCustomers) {
      if (c.id && matchesQuery(c)) map.set(c.id, c);
    }
    if (seedCustomer?.id && matchesQuery(seedCustomer)) {
      map.set(seedCustomer.id, seedCustomer);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [customersQuery.data, debouncedSearch, pinnedCustomers, seedCustomer]);

  const showResults =
    pickerOpen &&
    customerInput.trim().length >= 1 &&
    (customersQuery.isFetching ||
      customersQuery.isLoading ||
      searchResults.length > 0 ||
      debouncedSearch === customerInput.trim());

  useEffect(() => {
    if (!customerId || pickerOpen) return;
    if (selectedCustomer) setCustomerInput(formatCustomerLabel(selectedCustomer));
  }, [customerId, selectedCustomer, pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        if (selectedCustomer) setCustomerInput(formatCustomerLabel(selectedCustomer));
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen, selectedCustomer]);

  useEffect(() => {
    if (!customerId) {
      onCustomerSelected?.(null);
      return;
    }
    const c = selectedCustomer;
    if (c) onCustomerSelected?.(c);
  }, [customerId, selectedCustomer, onCustomerSelected]);

  const pickCustomer = useCallback(
    (c: CustomerOption) => {
      onCustomerIdChange(c.id);
      setCustomerInput(formatCustomerLabel(c));
      setPickerOpen(false);
      if (c.email?.trim() && onClientEmailChange && !clientEmail.trim()) {
        onClientEmailChange(c.email.trim());
      }
      onCustomerSelected?.(c);
    },
    [
      onCustomerIdChange,
      onClientEmailChange,
      onCustomerSelected,
      clientEmail,
    ]
  );

  const handleCustomerCreated = useCallback(
    (c: CustomerOption) => {
      setPinnedCustomers((prev) => {
        if (prev.some((x) => x.id === c.id)) return prev;
        return [c, ...prev];
      });
      pickCustomer(c);
      void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      void customersQuery.refetch();
    },
    [pickCustomer, queryClient, customersQuery]
  );

  const resultsId = `${inputId}-results`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <div ref={pickerRef} className="relative flex-1 min-w-0">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10"
            aria-hidden
          />
          <Input
            id={inputId}
            className={cn("pl-9", customerId && "pr-9")}
            placeholder="Digite o nome ou documento do cliente…"
            value={customerInput}
            onChange={(e) => {
              const v = e.target.value;
              setCustomerInput(v);
              setPickerOpen(true);
              if (customerId) onCustomerIdChange("");
            }}
            onFocus={() => !disabled && setPickerOpen(true)}
            autoComplete="off"
            role="combobox"
            aria-expanded={showResults}
            aria-controls={resultsId}
            aria-autocomplete="list"
            disabled={disabled}
            required={required && !customerId}
          />
          {customerId && !disabled ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none"
              aria-label="Limpar cliente"
              onClick={() => {
                onCustomerIdChange("");
                setCustomerInput("");
                setPickerOpen(true);
                onCustomerSelected?.(null);
              }}
            >
              ×
            </button>
          ) : null}
          {showResults ? (
            <ul
              id={resultsId}
              role="listbox"
              className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:bg-slate-950 dark:border-slate-700"
            >
              {customersQuery.isFetching || customersQuery.isLoading ? (
                <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  A pesquisar…
                </li>
              ) : searchResults.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-slate-500">
                  Nenhum cliente encontrado.
                </li>
              ) : (
                searchResults.slice(0, 25).map((c) => (
                  <li key={c.id} role="option">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-brand-50 dark:hover:bg-brand-950/30"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCustomer(c)}
                    >
                      <span className="font-medium text-slate-900 block">{c.name}</span>
                      {c.document?.trim() ? (
                        <span className="text-xs text-slate-500">{c.document}</span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        {showQuickCreate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start"
            disabled={disabled}
            onClick={() => setQuickOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        ) : null}
      </div>
      {selectedCustomer && !pickerOpen ? (
        <p className="text-xs text-slate-500">
          Cliente seleccionado:{" "}
          <span className="font-medium text-slate-700">
            {formatCustomerLabel(selectedCustomer)}
          </span>
        </p>
      ) : pickerOpen && customerInput.trim() && !customerId ? (
        <p className="text-xs text-slate-500">Clique num cliente na lista para seleccionar.</p>
      ) : null}
      {customersQuery.isError ? (
        <p className="text-xs text-red-600">
          {customersQuery.error instanceof Error
            ? customersQuery.error.message
            : "Erro ao carregar clientes."}
        </p>
      ) : null}
      <CustomerQuickCreateModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
}
