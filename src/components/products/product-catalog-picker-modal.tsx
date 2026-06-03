"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ProductPrefixTabs } from "@/components/products/product-prefix-tabs";
import type { ProductSearchHit } from "@/components/products/product-search-types";
import { cn } from "@/shared/utils/cn";
import { ProductCommercialQuickCreateModal } from "@/components/products/product-commercial-quick-create-modal";
import { useMe } from "@/hooks/use-me";

type ProductType = "finished" | "raw" | "component";

type CatalogRow = {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  technical_code: string | null;
  code: string | null;
  cost_price: number;
  is_active: boolean;
  default_is_external_labor?: boolean | null;
  default_labor_cost?: number | null;
  default_work_center_id?: string | null;
  prefix?: { code?: string | null } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeIds: string[];
  onSelect?: (product: ProductSearchHit) => void;
  multiSelect?: boolean;
  onComplete?: (products: ProductSearchHit[]) => void;
  title?: string;
  productType?: string;
  parentProductId?: string;
  showNewProductButton?: boolean;
  /** Abre cadastro rápido comercial (sem BOM) em vez de nova aba de engenharia. */
  commercialQuickCreate?: boolean;
  sourceQuoteId?: string | null;
  /** Lista só produtos com composição (products.has_composition). */
  hasCompositionOnly?: boolean;
};

const pickerQueryKey = (filters: {
  type: string;
  isActive: string;
  search: string;
  prefixCode: string;
  page: number;
  limit: number;
  hasCompositionOnly: boolean;
}) => ["product-catalog-picker", filters] as const;

async function fetchPrefixCodes(): Promise<string[]> {
  const res = await fetch("/api/products/prefix-codes", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: string[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao carregar prefixos");
  return json.data ?? [];
}

async function fetchCatalogPage(filters: {
  type: string;
  isActive: string;
  search: string;
  prefixCode: string;
  page: number;
  limit: number;
  hasCompositionOnly: boolean;
}): Promise<{ data: CatalogRow[]; pagination: { page: number; limit: number; total: number } }> {
  const params = new URLSearchParams();
  if (filters.type !== "all") params.append("type", filters.type);
  if (filters.isActive !== "all") {
    params.append("is_active", filters.isActive === "active" ? "true" : "false");
  }
  if (filters.hasCompositionOnly) {
    params.append("has_composition", "true");
  }
  if (filters.prefixCode.trim()) {
    params.append("prefix_code", filters.prefixCode.trim());
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/products?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: CatalogRow[];
    pagination?: { page: number; limit: number; total: number };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao pesquisar produtos");
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { page: filters.page, limit: filters.limit, total: 0 },
  };
}

function typeBadgeClasses(type: string): { label: string; className: string } {
  switch (type as ProductType) {
    case "finished":
      return {
        label: "Acabado",
        className: "bg-brand-50 text-brand-800 ring-1 ring-brand-700/25",
      };
    case "raw":
      return {
        label: "Matéria-prima",
        className: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
      };
    case "component":
      return {
        label: "Componente",
        className: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
      };
    default:
      return {
        label: type,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function rowToHit(row: CatalogRow): ProductSearchHit {
  return {
    id: row.id,
    technical_code: row.technical_code,
    code: row.code,
    name: row.name,
    cost_price: row.cost_price,
    unit: row.unit,
    default_is_external_labor: row.default_is_external_labor,
    default_labor_cost: row.default_labor_cost,
    default_work_center_id: row.default_work_center_id,
    prefix: row.prefix,
  };
}

function hitLabel(hit: ProductSearchHit): string {
  const sku = hit.technical_code?.trim() || hit.code?.trim() || "—";
  return `${sku} — ${hit.name}`;
}

export function ProductCatalogPickerModal({
  open,
  onOpenChange,
  excludeIds,
  onSelect,
  multiSelect = false,
  onComplete,
  title = "Pesquisar produto",
  productType = "all",
  parentProductId,
  showNewProductButton = true,
  commercialQuickCreate = false,
  sourceQuoteId,
  hasCompositionOnly = false,
}: Props) {
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [mounted, setMounted] = useState(false);
  const [commercialCreateOpen, setCommercialCreateOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    type: productType === "all" ? "all" : productType,
    isActive: "active",
    search: "",
    prefixCode: "",
    page: 1,
    limit: 25,
    hasCompositionOnly,
  });
  const [pending, setPending] = useState<ProductSearchHit[]>([]);

  const pendingIds = useMemo(() => new Set(pending.map((p) => p.id)), [pending]);
  const excludeSet = useMemo(
    () => new Set([...excludeIds, ...(multiSelect ? pending.map((p) => p.id) : [])]),
    [excludeIds, multiSelect, pending]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFilters((f) => ({
      ...f,
      type: productType === "all" ? "all" : productType,
      hasCompositionOnly,
      page: 1,
    }));
  }, [open, productType, hasCompositionOnly]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput, page: 1 }));
    }, 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      setSearchInput("");
      setFilters({
        type: productType === "all" ? "all" : productType,
        isActive: "active",
        search: "",
        prefixCode: "",
        page: 1,
        limit: 25,
        hasCompositionOnly,
      });
      setPending([]);
    }
  }, [open, productType, hasCompositionOnly]);

  const prefixCodesQuery = useQuery({
    queryKey: ["product-prefix-codes"],
    queryFn: fetchPrefixCodes,
    enabled: open,
  });

  const listQuery = useQuery({
    queryKey: pickerQueryKey(filters),
    queryFn: () => fetchCatalogPage(filters),
    enabled: open,
  });

  const rows = useMemo(() => {
    return (listQuery.data?.data ?? []).filter((r) => r.id && !excludeSet.has(r.id));
  }, [listQuery.data?.data, excludeSet]);

  const totalPages = listQuery.data?.pagination
    ? Math.max(1, Math.ceil(listQuery.data.pagination.total / filters.limit))
    : 1;

  const addToPending = useCallback((row: CatalogRow) => {
    const hit = rowToHit(row);
    if (pendingIds.has(hit.id)) return;
    setPending((prev) => [...prev, hit]);
  }, [pendingIds]);

  const removeFromPending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const pickSingle = (row: CatalogRow) => {
    const hit = rowToHit(row);
    onSelect?.(hit);
    onOpenChange(false);
  };

  const handleComplete = () => {
    if (pending.length === 0) {
      onOpenChange(false);
      return;
    }
    if (onComplete) {
      onComplete(pending);
    } else {
      for (const hit of pending) onSelect?.(hit);
    }
    setPending([]);
    onOpenChange(false);
  };

  function openNewProductTab() {
    if (commercialQuickCreate) {
      setCommercialCreateOpen(true);
      return;
    }
    const q = new URLSearchParams();
    q.set("fromBom", "1");
    if (parentProductId) q.set("parentProductId", parentProductId);
    if (typeof window !== "undefined") {
      q.set("returnPath", window.location.pathname + window.location.search);
    }
    window.open(`/products/new?${q.toString()}`, "_blank", "noopener,noreferrer");
  }

  const handleCommercialCreated = (hit: ProductSearchHit) => {
    setCommercialCreateOpen(false);
    if (commercialQuickCreate && onComplete) {
      onComplete([hit]);
      onOpenChange(false);
      void listQuery.refetch();
      return;
    }
    if (multiSelect) {
      addToPending({
        id: hit.id,
        name: hit.name,
        technical_code: hit.technical_code,
        code: hit.code,
        unit: hit.unit,
        cost_price: hit.cost_price,
        is_active: true,
        type: "finished",
      } as CatalogRow);
    } else {
      onSelect?.(hit);
      onOpenChange(false);
    }
    void listQuery.refetch();
  };

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-2 sm:p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-catalog-picker-title"
        className="relative z-10 flex w-[min(96vw,1400px)] max-w-[96vw] h-[min(92vh,900px)] max-h-[92vh] flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 shrink-0 bg-white">
          <div className="min-w-0">
            <h2
              id="product-catalog-picker-title"
              className="text-xl font-semibold text-slate-900 flex items-center gap-2"
            >
              <Package className="h-5 w-5 text-slate-600 shrink-0" aria-hidden />
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {multiSelect
                ? "Pesquise no catálogo, adicione itens à lista e clique em Concluir."
                : "Mesma listagem da página Produtos — clique em Seleccionar na linha desejada."}
            </p>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-1 shrink-0"
            aria-label="Fechar"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <ProductPrefixTabs
            codes={prefixCodesQuery.data ?? []}
            activeCode={filters.prefixCode}
            onChange={(code) =>
              setFilters((f) => ({ ...f, prefixCode: code, page: 1 }))
            }
            isLoading={prefixCodesQuery.isLoading}
            showAllTab={isAdmin}
          />

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <Input
                placeholder="Buscar por código ou nome…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {productType === "all" ? (
                <select
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  aria-label="Filtrar por tipo"
                  value={filters.type}
                  onChange={(e) =>
                    setFilters({ ...filters, type: e.target.value, page: 1 })
                  }
                >
                  <option value="all">Todos os tipos</option>
                  <option value="finished">Acabados</option>
                  <option value="raw">Matéria-prima</option>
                  <option value="component">Componentes</option>
                </select>
              ) : null}
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                aria-label="Por página"
                value={filters.limit}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    limit: Number(e.target.value) || 25,
                    page: 1,
                  })
                }
              >
                <option value={25}>25 / página</option>
                <option value={50}>50 / página</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void listQuery.refetch()}
                disabled={listQuery.isFetching}
              >
                Actualizar lista
              </Button>
              {showNewProductButton ? (
                <Button type="button" variant="secondary" size="sm" onClick={openNewProductTab}>
                  <Plus className="h-4 w-4" />
                  {commercialQuickCreate ? "Adicionar produto" : "Novo produto"}
                </Button>
              ) : null}
            </div>
          </div>

          {multiSelect && pending.length > 0 ? (
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2">
              <p className="text-xs font-medium text-slate-600 mb-2">
                Seleccionados ({pending.length})
              </p>
              <ul className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {pending.map((p) => (
                  <li
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-white px-2 py-1 text-xs max-w-full"
                  >
                    <span className="truncate">{hitLabel(p)}</span>
                    <button
                      type="button"
                      className="text-slate-500 hover:text-red-600 shrink-0"
                      aria-label={`Remover ${p.name}`}
                      onClick={() => removeFromPending(p.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {listQuery.isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Erro ao carregar produtos."}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
            <table className="w-full text-sm text-left min-w-[880px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    Código técnico
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Nome</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Tipo</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Und.</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Custo lista
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Estado</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right w-[8.5rem]">
                    Acção
                  </th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        A carregar…
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-slate-500">
                      Nenhum produto encontrado para estes filtros.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const tb = typeBadgeClasses(row.type);
                    const isPending = pendingIds.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-slate-100 last:border-0",
                          isPending && "bg-brand-50/40"
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                          {row.technical_code?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[20rem]">
                          <span className="line-clamp-2">{row.name}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                              tb.className
                            )}
                          >
                            {tb.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                          {row.unit?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(row.cost_price)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                              row.is_active
                                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                                : "bg-slate-100 text-slate-600 ring-1 ring-slate-300"
                            )}
                          >
                            {row.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {multiSelect ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={isPending ? "secondary" : "outline"}
                              disabled={isPending}
                              onClick={() => addToPending(row)}
                            >
                              {isPending ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  Na lista
                                </>
                              ) : (
                                "Adicionar"
                              )}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => pickSingle(row)}
                            >
                              Seleccionar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 px-5 py-3 shrink-0 bg-slate-50/80">
          <p className="text-sm text-slate-500">
            Página {filters.page} de {totalPages}
            {listQuery.data?.pagination?.total != null
              ? ` · ${listQuery.data.pagination.total} registo(s)`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filters.page <= 1 || listQuery.isFetching}
              onClick={() =>
                setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))
              }
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages || listQuery.isFetching}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Seguinte
              <ChevronRight className="h-4 w-4" />
            </Button>
            {multiSelect ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending.length === 0}
                  onClick={handleComplete}
                >
                  Concluir{pending.length > 0 ? ` (${pending.length})` : ""}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            )}
          </div>
        </div>
      </div>

      <ProductCommercialQuickCreateModal
        open={commercialCreateOpen}
        onOpenChange={setCommercialCreateOpen}
        sourceQuoteId={sourceQuoteId}
        onCreated={handleCommercialCreated}
      />
    </div>
  );

  return createPortal(overlay, document.body);
}
