"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Layers,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

type ProductType = "finished" | "raw" | "component";

interface ProductRow {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  technical_code: string | null;
  cost_price: number;
  selling_price: number;
  is_active: boolean;
}

interface ProductsApiResponse {
  data: ProductRow[];
  pagination: { page: number; limit: number; total: number };
}

const productsQueryKey = (filters: {
  type: string;
  isActive: string;
  search: string;
  page: number;
  limit: number;
}) => ["products", filters] as const;

async function fetchProducts(filters: {
  type: string;
  isActive: string;
  search: string;
  page: number;
  limit: number;
}): Promise<ProductsApiResponse> {
  const params = new URLSearchParams();
  if (filters.type !== "all") params.append("type", filters.type);
  if (filters.isActive !== "all") {
    params.append(
      "is_active",
      filters.isActive === "active" ? "true" : "false"
    );
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
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

async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao remover produto");
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
    page: 1,
    limit: 25,
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

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !isAdmin) return;
    setDeleteBusy(true);
    try {
      await deleteProduct(deleteTarget.id);
      toast.success("Produto marcado como inativo.");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setDeleteBusy(false);
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

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Produtos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo do tenant — códigos, custos de lista e estado.
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" size="sm" onClick={() => router.push("/products/new")}>
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <Package className="h-5 w-5 text-slate-600" aria-hidden />
            Listagem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
            <table className="w-full text-sm text-left min-w-[820px]">
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
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Venda
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Estado</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right w-[8rem]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        A carregar…
                      </span>
                    </td>
                  </tr>
                ) : !data?.data?.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                      Nenhum produto encontrado para estes filtros.
                    </td>
                  </tr>
                ) : (
                  data.data.map((product) => {
                    const tb = typeBadgeClasses(product.type);
                    return (
                      <tr key={product.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                          {product.technical_code?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[16rem]">
                          <span className="line-clamp-2">{product.name}</span>
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
                          {product.unit?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(product.cost_price)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(product.selling_price)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                              product.is_active
                                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                                : "bg-slate-100 text-slate-600 ring-1 ring-slate-300"
                            )}
                          >
                            {product.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right relative">
                          {isAdmin ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                aria-expanded={menuOpenFor === product.id}
                                aria-label="Abrir menu de acções"
                                onClick={() =>
                                  setMenuOpenFor((id) =>
                                    id === product.id ? null : product.id
                                  )
                                }
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                              {menuOpenFor === product.id ? (
                                <>
                                  <div
                                    role="presentation"
                                    className="fixed inset-0 z-10"
                                    onClick={() => setMenuOpenFor(null)}
                                  />
                                  <div className="absolute right-3 top-full z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg">
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                      onClick={() => {
                                        setMenuOpenFor(null);
                                        router.push(`/products/${product.id}/edit`);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                      Editar
                                    </button>
                                    {product.type === "finished" ? (
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                        onClick={() => {
                                          setMenuOpenFor(null);
                                          router.push(`/products/${product.id}/structure`);
                                        }}
                                      >
                                        <Layers className="h-4 w-4" />
                                        Estrutura (BOM)
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                      onClick={() => {
                                        setMenuOpenFor(null);
                                        setDeleteTarget(product);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Excluir
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

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

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="del-title" className="text-lg font-semibold text-slate-900">
              Confirmar exclusão
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              O produto{" "}
                <strong className="font-medium text-slate-900">
                  {deleteTarget.technical_code?.trim()
                    ? `${deleteTarget.technical_code} — `
                    : ""}
                  {deleteTarget.name}
                </strong>{" "}
              será marcado como inativo (soft delete).
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleteBusy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deleteBusy}
                onClick={() => void handleConfirmDelete()}
              >
                {deleteBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A remover…
                  </>
                ) : (
                  "Marcar como inativo"
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
