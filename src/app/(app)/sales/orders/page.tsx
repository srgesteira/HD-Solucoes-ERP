"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";
import type { SalesOrderStatus } from "@/lib/types/sales.types";

type ProdOrderBrief = {
  id: string;
  status: string;
  order_number: string;
} | null;

type SalesOrderListRow = {
  id: string;
  order_number: string;
  client_name: string;
  order_date: string;
  status: string;
  total: number;
  production_order?: unknown;
};

interface OrdersApiResponse {
  data: SalesOrderListRow[];
  pagination: { page: number; limit: number; total: number };
}

type StatusFilter =
  | "all"
  | SalesOrderStatus;

const ORDER_STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos os estados" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "in_production", label: "Em produção" },
  { value: "shipped", label: "Expedido" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
];

const salesOrdersQueryKey = (filters: {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}) => ["sales-orders", filters] as const;

async function fetchSalesOrders(filters: {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}): Promise<OrdersApiResponse> {
  const params = new URLSearchParams();
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));
  if (filters.status !== "all") params.append("status", filters.status);
  if (filters.search.trim()) params.append("client", filters.search.trim());
  if (filters.dateFrom.trim())
    params.append("date_from", filters.dateFrom.trim());
  if (filters.dateTo.trim()) params.append("date_to", filters.dateTo.trim());

  const res = await fetch(`/api/sales/orders?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as OrdersApiResponse & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : "Erro ao carregar pedidos de venda"
    );
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json as OrdersApiResponse;
}

async function putOrderStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar pedido");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function salesOrderStatusPill(
  status: string
): { label: string; className: string } {
  switch (status as SalesOrderStatus) {
    case "pending":
      return {
        label: "Pendente",
        className:
          "bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700/50",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        className:
          "bg-blue-50 text-blue-950 ring-1 ring-blue-200 dark:bg-blue-950/45 dark:text-blue-100 dark:ring-blue-700/45",
      };
    case "in_production":
      return {
        label: "Em produção",
        className:
          "bg-violet-50 text-violet-950 ring-1 ring-violet-200 dark:bg-violet-950/45 dark:text-violet-100 dark:ring-violet-700/50",
      };
    case "shipped":
      return {
        label: "Expedido",
        className:
          "bg-orange-50 text-orange-950 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:ring-orange-700/45",
      };
    case "delivered":
      return {
        label: "Entregue",
        className:
          "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

/** Normaliza FK aninhado do Supabase. */
function unwrapProductionOrder(raw: unknown): ProdOrderBrief {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const status = typeof o.status === "string" ? o.status : "";
  const order_number =
    typeof o.order_number === "string" ? o.order_number : "";
  if (!id) return null;
  return { id, status, order_number };
}

const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  imported: "Importado",
  planning: "Planeamento",
  in_production: "Em produção",
  ready: "Pronto",
  finished: "Finalizado",
  delayed: "Atrasado",
  cancelled: "Cancelado",
};

function productionStatusPillClass(status: string): string {
  switch (status) {
    case "imported":
      return "bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800/80 dark:text-slate-200";
    case "planning":
      return "bg-blue-50 text-blue-900 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100";
    case "in_production":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100";
    case "ready":
      return "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100";
    case "finished":
      return "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60";
    case "delayed":
      return "bg-orange-50 text-orange-900 ring-orange-200 dark:bg-orange-950/35";
    case "cancelled":
      return "bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/40";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

export default function SalesOrdersListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    search: "",
    dateFrom: "",
    dateTo: "",
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
    queryKey: salesOrdersQueryKey(filters),
    queryFn: () => fetchSalesOrders(filters),
  });

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SalesOrderListRow | null>(
    null
  );

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

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
  };

  const cancelMutation = useMutation({
    mutationFn: (rowId: string) => putOrderStatus(rowId, "cancelled"),
    onSuccess: () => {
      toast.success("Pedido de venda cancelado.");
      setCancelTarget(null);
      setMenuOpenFor(null);
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Pedidos de venda
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pedidos comerciais, filtros e acções administrativas.
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/sales/orders/new")}
          >
            <Plus className="h-4 w-4" />
            Novo pedido
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <ShoppingBag className="h-5 w-5 text-slate-600" aria-hidden />
            Listagem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden
              />
              <Input
                placeholder="Buscar por nº do pedido ou cliente…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap sm:items-center">
              <select
                className={cn(
                  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[12rem]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:bg-slate-950 dark:border-slate-600"
                )}
                aria-label="Filtrar por estado do pedido"
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value, page: 1 })
                }
              >
                {ORDER_STATUS_FILTERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  className="h-9 w-[11rem]"
                  aria-label="Data inicial"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      dateFrom: e.target.value,
                      page: 1,
                    })
                  }
                />
                <span className="text-slate-400 text-sm">até</span>
                <Input
                  type="date"
                  className="h-9 w-[11rem]"
                  aria-label="Data final"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      dateTo: e.target.value,
                      page: 1,
                    })
                  }
                />
              </div>
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

          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white dark:bg-slate-950 dark:border-slate-800">
            <table className="w-full text-sm text-left min-w-[1020px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800">
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Nº pedido
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Cliente
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    Data
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Estado
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right whitespace-nowrap">
                    Valor total
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Situação produção
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right w-[8rem]">
                    Acções
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-slate-500"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        A carregar…
                      </span>
                    </td>
                  </tr>
                ) : !data?.data?.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-slate-500"
                    >
                      Nenhum pedido encontrado para estes filtros.
                    </td>
                  </tr>
                ) : (
                  data.data.map((row) => {
                    const sb = salesOrderStatusPill(row.status);
                    const st = row.status as SalesOrderStatus;
                    const po = unwrapProductionOrder(row.production_order);
                    const canCancel =
                      isAdmin && st !== "delivered" && st !== "cancelled";
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {row.order_number}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[14rem]">
                          <span className="line-clamp-2">{row.client_name}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatDate(row.order_date)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                              sb.className
                            )}
                          >
                            {sb.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(row.total)}
                        </td>
                        <td className="px-3 py-2.5">
                          {po ? (
                            <div className="flex flex-col gap-1 max-w-[14rem]">
                              <span className="text-xs text-slate-500 truncate">
                                {po.order_number}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                                  productionStatusPillClass(po.status)
                                )}
                              >
                                {PRODUCTION_STATUS_LABEL[po.status] ??
                                  po.status}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right relative">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            aria-expanded={menuOpenFor === row.id}
                            aria-label="Abrir menu de acções"
                            onClick={() =>
                              setMenuOpenFor((open) =>
                                open === row.id ? null : row.id
                              )
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {menuOpenFor === row.id ? (
                            <>
                              <div
                                role="presentation"
                                className="fixed inset-0 z-10"
                                onClick={() => setMenuOpenFor(null)}
                              />
                              <div className="absolute right-3 top-full z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg dark:bg-slate-950 dark:border-slate-700">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                                  onClick={() => {
                                    setMenuOpenFor(null);
                                    router.push(`/sales/orders/${row.id}`);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                  Visualizar
                                </button>
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                                    onClick={() => {
                                      setMenuOpenFor(null);
                                      router.push(
                                        `/sales/orders/${row.id}/edit`
                                      );
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                    Editar
                                  </button>
                                ) : null}
                                {canCancel ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                    onClick={() => {
                                      setMenuOpenFor(null);
                                      setCancelTarget(row);
                                    }}
                                  >
                                    <Ban className="h-4 w-4" />
                                    Cancelar
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {data?.pagination?.total !== undefined && data.pagination.total > 0 ? (
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
              <p className="text-sm text-slate-500">
                Pedidos nesta página: {data.data.length}. Intervalo total:{" "}
                <span className="font-medium text-slate-700">
                  {rangeDescription}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      page: Math.max(1, filters.page - 1),
                    })
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

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="so-cancel-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
            <h3
              id="so-cancel-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Cancelar pedido de venda
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              O pedido{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {cancelTarget.order_number}
              </strong>{" "}
              passará ao estado <strong>cancelado</strong>. Confirma?
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => setCancelTarget(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelTarget.id)}
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A processar…
                  </>
                ) : (
                  "Confirmar cancelamento"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && error == null ? (
        <p className="text-xs text-slate-500 text-center pb-8">
          <Link href="/sales/quotes" className="text-brand-700 underline">
            Ir para orçamentos
          </Link>
        </p>
      ) : null}
    </div>
  );
}
