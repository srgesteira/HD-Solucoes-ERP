"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProductSearchHit = {
  id: string;
  technical_code: string | null;
  /** Código interno / legado (quando existir). */
  code: string | null;
  name: string;
  cost_price: number;
  unit: string | null;
  default_is_external_labor?: boolean | null;
  default_labor_cost?: number | null;
  default_work_center_id?: string | null;
  prefix?: { code?: string | null } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs a não mostrar (ex.: produto pai e já usados na BOM). */
  excludeIds: string[];
  onSelect: (product: ProductSearchHit) => void;
  /** Produto pai da BOM (para abrir criação com contexto). */
  parentProductId?: string;
  title?: string;
  /** Filtro API `type` (ex.: finished para orçamentos). */
  productType?: string;
  /** Mostrar botão que abre cadastro de produto noutro separador. */
  showNewProductButton?: boolean;
};

export function ProductSearchModal({
  open,
  onOpenChange,
  excludeIds,
  onSelect,
  parentProductId,
  title = "Pesquisar produto",
  productType,
  showNewProductButton = true,
}: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<ProductSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (p: number, q: string, limit: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("limit", String(limit));
        if (q) params.set("search", q);
        if (productType && productType !== "all") {
          params.set("type", productType);
        }
        params.set("is_active", "true");
        const res = await fetch(`/api/products?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: ProductSearchHit[];
          pagination?: { total?: number };
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao pesquisar");
        const raw = Array.isArray(json.data) ? json.data : [];
        const ex = new Set(excludeIds);
        const filtered = raw.filter((r) => r.id && !ex.has(r.id));
        setRows(filtered);
        setTotal(json.pagination?.total ?? filtered.length);
      } catch {
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [excludeIds, productType]
  );

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, debounced, pageSize]);

  useEffect(() => {
    if (!open) return;
    void fetchPage(page, debounced, pageSize);
  }, [open, page, debounced, pageSize, fetchPage]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
      setRows([]);
      setPage(1);
    }
  }, [open]);

  function openNewProductTab() {
    const q = new URLSearchParams();
    q.set("fromBom", "1");
    if (parentProductId) {
      q.set("parentProductId", parentProductId);
    }
    if (typeof window !== "undefined") {
      q.set("returnPath", window.location.pathname + window.location.search);
      const pid = parentProductId;
      if (pid) {
        try {
          sessionStorage.setItem("bomParentProductId", pid);
        } catch {
          /* ignore */
        }
      }
    }
    window.open(`/products/new?${q.toString()}`, "_blank", "noopener,noreferrer");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-search-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="product-search-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {productType === "finished"
                ? "Apenas produtos acabados (HD1, HD2, HD3, AC). Pesquise por nome ou código."
                : "Após criar um produto noutro separador, use \"Actualizar lista\" ou feche e reabra este diálogo."}
            </p>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            aria-label="Fechar"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-100 px-5 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="prod-search-q">Nome, código técnico ou código interno</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="prod-search-q"
                  className="pl-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Pesquisar…"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor="prod-page-size" className="text-xs text-slate-600 whitespace-nowrap">
                Por página
              </Label>
              <select
                id="prod-page-size"
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || 25);
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void fetchPage(page, debounced, pageSize)}
              disabled={loading}
            >
              Actualizar lista
            </Button>
            {showNewProductButton ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={openNewProductTab}
              >
                Novo produto
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-12 text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Nenhum resultado. Ajuste a pesquisa ou crie um produto novo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-2">Cód. técnico</th>
                  <th className="pb-2 pr-2">Cód. interno</th>
                  <th className="pb-2 pr-2">Nome</th>
                  <th className="pb-2 pr-2 text-right">Custo</th>
                  <th className="pb-2 w-28 text-right">Acção</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs text-slate-700">
                      {r.technical_code?.trim() || "—"}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs text-slate-600">
                      {r.code?.trim() || "—"}
                    </td>
                    <td className="py-2 pr-2 text-slate-900">{r.name}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-700">
                      {Number(r.cost_price ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          onSelect(r);
                          onOpenChange(false);
                        }}
                      >
                        Seleccionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages} · {total} registo(s) no servidor
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Seguinte
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
