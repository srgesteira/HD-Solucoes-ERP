"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  ShoppingBag,
} from "lucide-react";
import { SalesOrderRowActionsMenu } from "@/components/sales/sales-order-row-actions-menu";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";
import type { SalesOrderStatus } from "@/modules/core/types/sales.types";
import type { SalesOrderProductionSituation } from "@/modules/vendas/lib/sales/sales-order-production-summary";
import {
  formatSalesListDate,
  productionSituationPill,
  salesOrderStatusPill,
  SALES_ORDER_LIST_TAB_LABELS,
  SALES_ORDER_LIST_TABS,
  type SalesOrderListTab,
} from "@/modules/vendas/lib/sales/sales-order-list-display";

type SalesOrderListRow = {
  id: string;
  order_number: string;
  client_name: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  total: number;
  ready_for_invoice?: boolean;
  production_deadline: string | null;
  production_situation: SalesOrderProductionSituation;
};

interface OrdersApiResponse {
  data: SalesOrderListRow[];
  pagination: { page: number; limit: number; total: number };
  tab?: string;
}

const salesOrdersQueryKey = (filters: {
  tab: SalesOrderListTab;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}) => ["sales-orders", filters] as const;

async function fetchSalesOrders(filters: {
  tab: SalesOrderListTab;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}): Promise<OrdersApiResponse> {
  const params = new URLSearchParams();
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));
  params.append("tab", filters.tab);
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

async function deleteSalesOrder(id: string): Promise<void> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao excluir pedido");
}

async function reactivateSalesOrder(id: string): Promise<void> {
  const res = await fetch(`/api/sales/orders/${id}/reactivate`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao reativar pedido");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export default function SalesOrdersListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canSales = isAdmin || can("sales");

  useEffect(() => {
    if (me && !canSales) {
      toast.error("Sem permissão para o módulo Vendas.");
      router.replace("/home");
    }
  }, [me, canSales, router]);

  const [tab, setTab] = useState<SalesOrderListTab>("open");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
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

  const queryFilters = useMemo(
    () => ({ ...filters, tab }),
    [filters, tab]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: salesOrdersQueryKey(queryFilters),
    queryFn: () => fetchSalesOrders(queryFilters),
  });

  const [cancelTarget, setCancelTarget] = useState<SalesOrderListRow | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<SalesOrderListRow | null>(
    null
  );
  const [reactivateTarget, setReactivateTarget] =
    useState<SalesOrderListRow | null>(null);

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
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (rowId: string) => deleteSalesOrder(rowId),
    onSuccess: () => {
      toast.success("Pedido de venda excluído permanentemente.");
      setDeleteTarget(null);
      invalidateList();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: (rowId: string) => reactivateSalesOrder(rowId),
    onSuccess: (_data, rowId) => {
      toast.success("Pedido reativado com sucesso.");
      setReactivateTarget(null);
      invalidateList();
      router.push(`/sales/orders/${rowId}/edit`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function onTabChange(next: SalesOrderListTab) {
    setTab(next);
    setFilters((f) => ({ ...f, page: 1 }));
  }

  return (
    <div className="max-w-[90rem] mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Pedidos de venda
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Visão comercial com prazos de entrega, produção e situação PCP.
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
          <nav
            className="flex flex-wrap gap-1 border-b border-slate-200 -mx-1"
            role="tablist"
            aria-label="Filtrar pedidos por situação"
          >
            {SALES_ORDER_LIST_TABS.map((tabId) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={tab === tabId}
                className={cn(
                  "px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap",
                  tab === tabId
                    ? "border-brand-700 text-brand-800 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                )}
                onClick={() => onTabChange(tabId)}
              >
                {SALES_ORDER_LIST_TAB_LABELS[tabId]}
              </button>
            ))}
          </nav>

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
            <table className="w-full text-sm text-left min-w-[1200px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800">
                  <th className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    Nº pedido
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Cliente
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    Data
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    Prazo entrega
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    Prazo produção
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Status
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Situação produção
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right whitespace-nowrap">
                    Valor total
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
                      colSpan={9}
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
                      colSpan={9}
                      className="px-3 py-10 text-center text-slate-500"
                    >
                      Nenhum pedido em «{SALES_ORDER_LIST_TAB_LABELS[tab]}»
                      {filters.search ? " para esta busca." : "."}
                    </td>
                  </tr>
                ) : (
                  data.data.map((row) => {
                    const sb = salesOrderStatusPill(row.status);
                    const prod = productionSituationPill(
                      row.production_situation ?? "none"
                    );
                    const st = row.status as SalesOrderStatus;
                    const canCancel =
                      isAdmin && st !== "delivered" && st !== "cancelled";
                    const canReactivate = isAdmin && st === "cancelled";
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800 hover:bg-slate-50/60"
                      >
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                          <Link
                            href={`/sales/orders/${row.id}`}
                            className="text-brand-800 hover:underline font-mono"
                          >
                            {row.order_number}
                          </Link>
                          {row.ready_for_invoice && tab !== "ready" ? (
                            <span
                              className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-900 ring-1 ring-teal-200"
                              title="Liberado para faturamento"
                            >
                              Faturar
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[14rem]">
                          <span className="line-clamp-2">{row.client_name}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatSalesListDate(row.order_date)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatSalesListDate(row.expected_delivery)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatSalesListDate(row.production_deadline)}
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
                        <td className="px-3 py-2.5">
                          {row.production_situation === "none" ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                                prod.className
                              )}
                            >
                              {prod.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(row.total)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <SalesOrderRowActionsMenu
                            orderId={row.id}
                            canEdit={canSales}
                            canCancel={canCancel}
                            canDelete={isAdmin}
                            canReactivate={canReactivate}
                            onCancel={() => setCancelTarget(row)}
                            onDelete={() => setDeleteTarget(row)}
                            onReactivate={() => setReactivateTarget(row)}
                          />
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

      {reactivateTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="so-reactivate-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
            <h3
              id="so-reactivate-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Reativar pedido de venda
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Tem certeza que deseja reativar o pedido{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {reactivateTarget.order_number}
              </strong>
              ? Ele voltará ao estado <strong>pendente</strong> e poderá ser
              editado antes de nova confirmação.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reactivateMutation.isPending}
                onClick={() => setReactivateTarget(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={reactivateMutation.isPending}
                onClick={() =>
                  reactivateMutation.mutate(reactivateTarget.id)
                }
              >
                {reactivateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A reativar…
                  </>
                ) : (
                  "Reativar pedido"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="so-delete-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
            <h3
              id="so-delete-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Excluir pedido de venda
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              O pedido{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {deleteTarget.order_number}
              </strong>{" "}
              será removido permanentemente, incluindo itens, parcelas a receber
              e histórico de alterações. Esta acção não pode ser desfeita.
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Pedidos com produção associada não podem ser excluídos.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? (
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
