"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/utils/cn";
import { SUPPLIERS_ACTIVE_QUERY_KEY } from "@/modules/compras/lib/suppliers/query-keys";
import {
  SupplierQuickCreateModal,
  type SupplierOption,
} from "@/components/purchasing/supplier-quick-create-modal";

function supplierLabel(s: SupplierOption): string {
  const code = s.code?.trim() || "—";
  const name = s.name?.trim() || "—";
  return `${code} — ${name}`;
}

function matchesSupplierQuery(s: SupplierOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    s.code.toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q) ||
    (s.document?.toLowerCase().includes(q) ?? false)
  );
}

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (supplierId: string) => void;
  suppliers: SupplierOption[];
  loading?: boolean;
  errorMessage?: string | null;
  allowQuickCreate?: boolean;
  onSupplierCreated?: (supplier: SupplierOption) => void;
  emptyOptionLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function SupplierSelectField({
  id = "supplier",
  label = "Fornecedor",
  value,
  onChange,
  suppliers,
  loading,
  errorMessage,
  allowQuickCreate = true,
  onSupplierCreated,
  emptyOptionLabel = "Sem fornecedor",
  className,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [extra, setExtra] = useState<SupplierOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inputText, setInputText] = useState("");

  const merged = useMemo(() => {
    const map = new Map<string, SupplierOption>();
    for (const s of suppliers) map.set(s.id, s);
    for (const s of extra) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return [...map.values()].sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "pt")
    );
  }, [suppliers, extra]);

  const selected = useMemo(
    () => merged.find((s) => s.id === value) ?? null,
    [merged, value]
  );

  useEffect(() => {
    if (pickerOpen) return;
    if (selected) {
      setInputText(supplierLabel(selected));
    } else if (!value) {
      setInputText("");
    }
  }, [selected, value, pickerOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    if (!pickerOpen && selected) return [selected];
    return merged.filter((s) => matchesSupplierQuery(s, inputText));
  }, [merged, inputText, pickerOpen, selected]);

  const showResults = pickerOpen && !disabled && !loading;

  const handleCreated = (s: SupplierOption) => {
    setExtra((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
    onChange(s.id);
    setInputText(supplierLabel(s));
    setPickerOpen(false);
    void queryClient.invalidateQueries({ queryKey: SUPPLIERS_ACTIVE_QUERY_KEY });
    onSupplierCreated?.(s);
  };

  const pickSupplier = (s: SupplierOption) => {
    onChange(s.id);
    setInputText(supplierLabel(s));
    setPickerOpen(false);
  };

  const clearSelection = () => {
    onChange("");
    setInputText("");
    setPickerOpen(true);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {allowQuickCreate && !disabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setQuickOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo fornecedor
          </Button>
        ) : null}
      </div>

      <div ref={containerRef} className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          id={id}
          className={cn("pl-9", value && !disabled && "pr-9")}
          placeholder="Digite código ou nome do fornecedor…"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setPickerOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => !disabled && setPickerOpen(true)}
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-autocomplete="list"
          disabled={disabled || loading}
          aria-busy={loading}
        />
        {value && !disabled ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Limpar fornecedor"
            onClick={clearSelection}
          >
            ×
          </button>
        ) : null}

        {showResults ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          >
            <li role="option">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange("");
                  setInputText("");
                  setPickerOpen(false);
                }}
              >
                {emptyOptionLabel}
              </button>
            </li>
            {loading ? (
              <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                A carregar fornecedores…
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-slate-500">
                Nenhum fornecedor encontrado.
              </li>
            ) : (
              filtered.slice(0, 40).map((s) => (
                <li key={s.id} role="option" aria-selected={s.id === value}>
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm hover:bg-brand-50",
                      s.id === value && "bg-brand-50/80"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSupplier(s)}
                  >
                    <span className="font-medium text-slate-900 block">
                      {s.name}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {s.code}
                      {s.document?.trim() ? ` · ${s.document}` : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="text-xs text-red-600">{errorMessage}</p>
      ) : null}
      {selected && !pickerOpen ? (
        <p className="text-xs text-slate-500">
          Fornecedor seleccionado:{" "}
          <span className="font-medium text-slate-700">{selected.name}</span>
        </p>
      ) : null}

      <SupplierQuickCreateModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
