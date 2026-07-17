"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/utils/cn";
import { matchesTokenSearch } from "@/shared/utils/universal-search";
import { ProductCatalogPickerModal } from "@/components/products/product-catalog-picker-modal";
import type { ProductSearchHit } from "@/components/products/product-search-types";

function productLabel(p: ProductSearchHit): string {
  const sku = p.technical_code?.trim() || p.code?.trim() || "—";
  return `${sku} — ${p.name}`;
}

function matchesLocal(p: ProductSearchHit, query: string): boolean {
  return matchesTokenSearch(query, [
    p.technical_code,
    p.code,
    p.name,
    p.description,
  ]);
}

async function searchProducts(args: {
  search: string;
  productType: string;
  limit: number;
}): Promise<ProductSearchHit[]> {
  const params = new URLSearchParams();
  if (args.productType !== "all") params.set("type", args.productType);
  params.set("is_active", "true");
  if (args.search.trim()) params.set("search", args.search.trim());
  params.set("page", "1");
  params.set("limit", String(args.limit));

  const res = await fetch(`/api/products?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      id: string;
      technical_code: string | null;
      code: string | null;
      name: string;
      description?: string | null;
      cost_price: number;
      unit: string | null;
      product_nature?: string | null;
      prefix?: { code?: string | null } | null;
    }>;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao pesquisar produtos");
  return (json.data ?? []).map((row) => ({
    id: row.id,
    technical_code: row.technical_code,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    cost_price: Number(row.cost_price ?? 0),
    unit: row.unit,
    product_nature: row.product_nature ?? null,
    prefix: row.prefix,
  }));
}

type Props = {
  id?: string;
  value: ProductSearchHit | null;
  onChange: (product: ProductSearchHit | null) => void;
  productType?: string;
  excludeIds?: string[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Abre o catálogo com filtros avançados (lupa). */
  enableCatalogModal?: boolean;
  catalogTitle?: string;
  showNewProductButton?: boolean;
  commercialQuickCreate?: boolean;
  sourceQuoteId?: string | null;
  compact?: boolean;
  parentProductId?: string;
  hasCompositionOnly?: boolean;
};

/**
 * Combobox de produto (padrão único do sistema).
 * Digitar filtra por código/descrição; lupa abre ProductCatalogPickerModal.
 */
export function ProductComboboxField({
  id,
  value,
  onChange,
  productType = "all",
  excludeIds = [],
  disabled = false,
  className,
  placeholder = "Digite código ou descrição…",
  enableCatalogModal = true,
  catalogTitle = "Pesquisar produto",
  showNewProductButton = false,
  commercialQuickCreate = false,
  sourceQuoteId = null,
  compact = false,
  parentProductId,
  hasCompositionOnly = false,
}: Props) {
  const listboxId = useId();
  const autoId = useId();
  const inputId = id ?? autoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (pickerOpen) return;
    setInputText(value ? productLabel(value) : "");
  }, [value, pickerOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(inputText), 250);
    return () => window.clearTimeout(t);
  }, [inputText]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const searchEnabled =
    pickerOpen && !disabled && debounced.trim().length >= 1;

  const searchQuery = useQuery({
    queryKey: ["product-combobox", productType, debounced],
    queryFn: () =>
      searchProducts({
        search: debounced,
        productType,
        limit: 25,
      }),
    enabled: searchEnabled,
    staleTime: 15_000,
  });

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filtered = useMemo(() => {
    const rows = searchQuery.data ?? [];
    return rows
      .filter((p) => !exclude.has(p.id) || p.id === value?.id)
      .filter((p) => matchesLocal(p, debounced))
      .slice(0, 25);
  }, [searchQuery.data, exclude, value?.id, debounced]);

  const showResults = pickerOpen && !disabled;
  const inputClass = compact ? "h-8 text-sm pl-8 pr-16" : "pl-9 pr-20";

  const pick = (hit: ProductSearchHit) => {
    onChange(hit);
    setInputText(productLabel(hit));
    setPickerOpen(false);
  };

  const clear = () => {
    onChange(null);
    setInputText("");
    setPickerOpen(true);
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div className="relative flex gap-1">
        <div className="relative flex-1 min-w-0">
          <Search
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400",
              compact ? "h-3.5 w-3.5" : "h-4 w-4"
            )}
            aria-hidden
          />
          <Input
            id={inputId}
            className={inputClass}
            placeholder={placeholder}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              setPickerOpen(true);
              if (value) onChange(null);
            }}
            onFocus={() => !disabled && setPickerOpen(true)}
            autoComplete="off"
            role="combobox"
            aria-expanded={showResults}
            aria-controls={listboxId}
            aria-autocomplete="list"
            disabled={disabled}
          />
          {value && !disabled ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none"
              aria-label="Limpar produto"
              onClick={clear}
            >
              ×
            </button>
          ) : null}
        </div>
        {enableCatalogModal ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("shrink-0 px-2", compact ? "h-8 w-8" : "h-9 w-9")}
            title="Busca refinada no catálogo"
            aria-label="Abrir catálogo de produtos"
            disabled={disabled}
            onClick={() => setCatalogOpen(true)}
          >
            <Search className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>
        ) : null}
      </div>

      {showResults ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950"
        >
          {searchQuery.isFetching ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              A pesquisar…
            </li>
          ) : !debounced.trim() ? (
            <li className="px-3 py-2.5 text-sm text-slate-500">
              Digite código ou descrição para filtrar.
            </li>
          ) : searchQuery.isError ? (
            <li className="px-3 py-2.5 text-sm text-red-600">
              {(searchQuery.error as Error).message}
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-500">
              Nenhum produto encontrado.
            </li>
          ) : (
            filtered.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === value?.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm hover:bg-brand-50 dark:hover:bg-brand-950/30",
                    p.id === value?.id && "bg-brand-50/80"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100 block">
                    {p.name}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {p.technical_code?.trim() || p.code?.trim() || "—"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      <ProductCatalogPickerModal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        excludeIds={excludeIds}
        productType={productType}
        multiSelect={false}
        title={catalogTitle}
        showNewProductButton={showNewProductButton}
        commercialQuickCreate={commercialQuickCreate}
        sourceQuoteId={sourceQuoteId}
        parentProductId={parentProductId}
        hasCompositionOnly={hasCompositionOnly}
        onSelect={(hit) => {
          pick(hit);
          setCatalogOpen(false);
        }}
      />
    </div>
  );
}
