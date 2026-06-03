"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { ProductPrefixTabs } from "@/components/products/product-prefix-tabs";
import { ProductRowActionsMenu } from "@/components/products/product-row-actions-menu";

type ProductType = "finished" | "raw" | "component";

interface ProductRow {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  technical_code: string | null;
  cost_price: number;
  is_active: boolean;
  engineering_workflow_status?: string | null;
  released_for_sale?: boolean;
}

interface ProductsApiResponse {
  data: ProductRow[];
  pagination: { page: number; limit: number; total: number };
}

const productsQueryKey = (filters: {
  type: string;
  isActive: string;
  search: string;
  prefixCode: string;
  page: number;
  limit: number;
  workflowPending: boolean;
}) => ["products", filters] as const;

async function fetchPrefixCodes(): Promise<string[]> {
  const res = await fetch("/api/products/prefix-codes", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: string[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar prefixos");
  }
  return json.data ?? [];
}

async function fetchProducts(filters: {
  type: string;
  isActive: string;
  search: string;
  prefixCode: string;
  page: number;
  limit: number;
  workflowPending: boolean;
}): Promise<ProductsApiResponse> {
  const params = new URLSearchParams();
  if (filters.type !== "all") params.append("type", filters.type);
  if (filters.isActive !== "all") {
    params.append(
      "is_active",
      filters.isActive === "active" ? "true" : "false"
    );
  }
  if (filters.prefixCode.trim()) {
    params.append("prefix_code", filters.prefixCode.trim());
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
  if (filters.workflowPending) params.append("workflow_pending", "1");
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/products?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ProductsApiResponse & {
    error?: string;
    detail?: unknown;
  };

  if (!res.ok) {
    const errMsg =
      typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : "Erro ao carregar produtos";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json as ProductsApiResponse;
}

async function deactivateProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: false }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao marcar produto como inativo");
  }
}

async function hardDeleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao excluir produto");
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
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30",
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

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    type: "all",
    isActive: "all",
    search: "",
    prefixCode: "",
    page: 1,
    limit: 25,
    workflowPending: false,
  });

  const prefixCodesQuery = useQuery({
    queryKey: ["product-prefix-codes"],
    queryFn: fetchPrefixCodes,
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput, page: 1 }));
    }, 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: productsQueryKey(filters),
    queryFn: () => fetchProducts(filters),
  });

  const [deactivateTarget, setDeactivateTarget] = useState<ProductRow | null>(
    null
  );
  const [hardDeleteTarget, setHardDeleteTarget] = useState<ProductRow | null>(
    null
  );
  const [actionBusy, setActionBusy] = useState(false);

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget || !isAdmin) return;
    setActionBusy(true);
    try {
      await deactivateProduct(deactivateTarget.id);
      toast.success("Produto marcado como inativo.");
      setDeactivateTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível desactivar."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmHardDelete = async () => {
    if (!hardDeleteTarget || !isAdmin) return;
    setActionBusy(true);
    try {
      await hardDeleteProduct(hardDeleteTarget.id);
      toast.success("Produto excluído permanentemente.");
      setHardDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setActionBusy(false);
    }
  };

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / filters.limit))
    : 0;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    const start = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
    const end = Math.min(filters.page * filters.limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination, filters.page, filters.limit]);

  const tableColumns = useMemo((): SortableTableColumn<ProductRow>[] => {
    return [
      {
        key: "technical_code",
        label: "Código técnico",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.technical_code,
        truncate: false,
        render: (row) => (
          <button
            type="button"
            onClick={() => router.push(`/products/${row.id}/edit`)}
            className="font-mono text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline whitespace-nowrap cursor-pointer text-left"
          >
            {row.technical_code?.trim() || "—"}
          </button>
        ),
      },
      {
        key: "name",
        label: "Nome",
        type: "text",
        width: "w-[24%]",
        accessor: (row) => row.name,
        truncate: false,
        render: (row) => {
          const pendingStructure =
            row.engineering_workflow_status === "pending_composition";
          return (
            <>
              <span className="text-slate-800 line-clamp-2">{row.name}</span>
              {pendingStructure ? (
                <span className="mt-1 block text-xs font-medium text-amber-800">
                  Aguarda estrutura (comercial)
                </span>
              ) : null}
            </>
          );
        },
      },
      {
        key: "type",
        label: "Tipo",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => typeBadgeClasses(row.type).label,
        truncate: false,
        render: (row) => {
          const tb = typeBadgeClasses(row.type);
          return (
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                tb.className
              )}
            >
              {tb.label}
            </span>
          );
        },
      },
      {
        key: "unit",
        label: "Und.",
        type: "text",
        width: "w-[8%]",
        accessor: (row) => row.unit,
        truncate: false,
        render: (row) => (
          <span className="text-slate-700 whitespace-nowrap">
            {row.unit?.trim() || "—"}
          </span>
        ),
      },
      {
        key: "cost_price",
        label: "Custo lista",
        type: "number",
        width: "w-[12%]",
        align: "right",
        accessor: (row) => row.cost_price,
        truncate: false,
        render: (row) => (
          <span className="tabular-nums text-slate-800">
            {formatCurrency(row.cost_price)}
          </span>
        ),
      },
      {
        key: "is_active",
        label: "Estado",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => (row.is_active ? "Ativo" : "Inativo"),
        truncate: false,
        render: (row) => (
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
        ),
      },
    ];
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Produtos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo do tenant — códigos, custos de lista e estado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={filters.workflowPending ? "primary" : "outline"}
            className={cn(
              filters.workflowPending &&
                "animate-pulse ring-2 ring-amber-400 ring-offset-1"
            )}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                workflowPending: !f.workflowPending,
                page: 1,
              }))
            }
          >
            Estrutura pendente
          </Button>
          {isAdmin ? (
            <Button type="button" size="sm" onClick={() => router.push("/products/new")}>
              <Plus className="h-4 w-4" />
              Novo produto
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <Package className="h-5 w-5 text-slate-600" aria-hidden />
            Listagem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <select
                className={cn(
                  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                )}
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
              <select
                className={cn(
                  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                )}
                aria-label="Filtrar por estado"
                value={filters.isActive}
                onChange={(e) =>
                  setFilters({ ...filters, isActive: e.target.value, page: 1 })
                }
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-red-800">{error.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Tentar de novo
              </Button>
            </div>
          ) : null}

          <SortableTable
            columns={tableColumns}
            data={data?.data ?? []}
            getRowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Nenhum produto encontrado para estes filtros."
            rowClassName={(row) =>
              row.engineering_workflow_status === "pending_composition"
                ? "bg-amber-50/90 animate-pulse ring-1 ring-inset ring-amber-300/80"
                : ""
            }
            actionsColumn={{
              label: "Ações",
              width: "w-[5rem]",
              render: (product) =>
                isAdmin ? (
                  <ProductRowActionsMenu
                    productId={product.id}
                    productType={product.type}
                    onDeactivate={() => setDeactivateTarget(product)}
                    onHardDelete={() => setHardDeleteTarget(product)}
                  />
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            }}
          />

          {data?.pagination?.total !== undefined &&
          data.pagination.total > 0 ? (
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
              <p className="text-sm text-slate-500">
                Produtos nesta página: {data.data.length}. Intervalo total:{" "}
                <span className="font-medium text-slate-700">{rangeDescription}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters({ ...filters, page: Math.max(1, filters.page - 1) })
                  }
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm tabular-nums px-2 text-slate-600">
                  Página {filters.page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      page: Math.min(totalPages, filters.page + 1),
                    })
                  }
                  aria-label="Página seguinte"
                >
                  Seguinte
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {deactivateTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3
              id="deactivate-title"
              className="text-lg font-semibold text-slate-900"
            >
              Marcar como inativo
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              O produto{" "}
              <strong className="font-medium text-slate-900">
                {deactivateTarget.technical_code?.trim()
                  ? `${deactivateTarget.technical_code} — `
                  : ""}
                {deactivateTarget.name}
              </strong>{" "}
              deixará de aparecer como ativo, mas permanece no sistema.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionBusy}
                onClick={() => setDeactivateTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={actionBusy}
                onClick={() => void handleConfirmDeactivate()}
              >
                {actionBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A guardar…
                  </>
                ) : (
                  "Marcar como inativo"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {hardDeleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hard-del-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="hard-del-title" className="text-lg font-semibold text-slate-900">
              Excluir permanentemente
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Tem certeza que deseja excluir este produto? Esta ação é
              irreversível. O produto só será excluído se não tiver sido usado em
              vendas, compras, produção ou composições.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {hardDeleteTarget.technical_code?.trim()
                ? `${hardDeleteTarget.technical_code} — `
                : ""}
              {hardDeleteTarget.name}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionBusy}
                onClick={() => setHardDeleteTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={actionBusy}
                onClick={() => void handleConfirmHardDelete()}
              >
                {actionBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A excluir…
                  </>
                ) : (
                  "Excluir permanentemente"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && error == null ? (
        <p className="text-xs text-slate-500 text-center pb-8">
          <Link href="/boards" className="text-brand-700 underline">
            Voltar às tarefas
          </Link>
        </p>
      ) : null}
    </div>
  );
}
