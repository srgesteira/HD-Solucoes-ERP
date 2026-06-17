"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
} from "lucide-react";
import { SalesOrderRowActionsMenu } from "@/components/sales/sales-order-row-actions-menu";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { InlineDateEdit } from "@/shared/ui/inline-date-edit";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AppPage } from "@/shared/ui/app-page";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
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
  page: number;
  limit: number;
}) => ["sales-orders", filters] as const;

async function fetchSalesOrders(filters: {
  tab: SalesOrderListTab;
  search: string;
  page: number;
  limit: number;
}): Promise<OrdersApiResponse> {
  const params = new URLSearchParams();
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));
  params.append("tab", filters.tab);
  if (filters.search.trim()) params.append("search", filters.search.trim());

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

async function patchOrderField(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/sales/orders/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar pedido");
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

  const [tab, setTab] = useState<SalesOrderListTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  const queryFilters = useMemo(
    () => ({ search, tab, page, limit }),
    [search, tab, page, limit]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: salesOrdersQueryKey(queryFilters),
    queryFn: () => fetchSalesOrders(queryFilters),
    staleTime: 60_000,
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
    ? Math.max(1, Math.ceil(data.pagination.total / limit))
    : 0;

  const rangeDescription = useMemo(() => {
    if (!data?.pagination) return "";
    const { total } = data.pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination, page, limit]);

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

  function onTabChange(next: string) {
    setTab(next as SalesOrderListTab);
    setPage(1);
  }

  const handleExpectedDeliveryChange = useCallback(
    async (row: SalesOrderListRow, date: string | null) => {
      if (!canSales) return;
      try {
        await patchOrderField(row.id, { expected_delivery: date });
        toast.success("Prazo de entrega actualizado.");
        invalidateList();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Não foi possível actualizar o prazo."
        );
      }
    },
    [canSales]
  );

  const tableColumns = useMemo((): SortableTableColumn<SalesOrderListRow>[] => {
    return [
      {
        key: "order_number",
        label: "Nº pedido",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => row.order_number,
        truncate: false,
        render: (row) => (
          <>
            <Link
              href={`/sales/orders/${row.id}`}
              className={CRONOGRAMA_TOKENS.cellLink}
            >
              {row.order_number}
            </Link>
            {row.ready_for_invoice && tab !== "ready" ? (
              <span
                className="ml-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-900 ring-1 ring-teal-200"
                title="Liberado para faturamento"
              >
                Faturar
              </span>
            ) : null}
          </>
        ),
      },
      {
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[18%]",
        accessor: (row) => row.client_name,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>{row.client_name}</span>
        ),
      },
      {
        key: "order_date",
        label: "Data",
        type: "date",
        width: "w-[8%]",
        accessor: (row) => row.order_date,
        truncate: false,
        render: (row) => (
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
            {formatSalesListDate(row.order_date)}
          </span>
        ),
      },
      {
        key: "expected_delivery",
        label: "Prazo entrega",
        type: "date",
        width: "w-[11%]",
        accessor: (row) => row.expected_delivery,
        truncate: false,
        render: (row) =>
          canSales ? (
            <InlineDateEdit
              value={row.expected_delivery}
              onSave={(v) => handleExpectedDeliveryChange(row, v)}
            />
          ) : (
            <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
              {formatSalesListDate(row.expected_delivery)}
            </span>
          ),
      },
      {
        key: "production_deadline",
        label: "Prazo produção",
        type: "date",
        width: "w-[9%]",
        accessor: (row) => row.production_deadline,
        render: (row) => (
          <span className="text-slate-700 tabular-nums whitespace-nowrap">
            {formatSalesListDate(row.production_deadline)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        type: "text",
        width: "w-[10%]",
        accessor: (row) => salesOrderStatusPill(row.status).label,
        truncate: false,
        render: (row) => {
          const sb = salesOrderStatusPill(row.status);
          return (
            <span className={cn(CRONOGRAMA_TOKENS.badge, sb.className)}>
              {sb.label}
            </span>
          );
        },
      },
      {
        key: "production_situation",
        label: "Situação produção",
        type: "text",
        width: "w-[12%]",
        accessor: (row) =>
          productionSituationPill(row.production_situation ?? "none").label,
        truncate: false,
        render: (row) => {
          if (row.production_situation === "none") {
            return <span className="text-slate-400">—</span>;
          }
          const prod = productionSituationPill(
            row.production_situation ?? "none"
          );
          return (
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                prod.className
              )}
            >
              {prod.label}
            </span>
          );
        },
      },
      {
        key: "total",
        label: "Valor total",
        type: "number",
        width: "w-[9%]",
        align: "right",
        accessor: (row) => row.total,
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {formatCurrency(row.total)}
          </span>
        ),
      },
    ];
  }, [tab, canSales, handleExpectedDeliveryChange]);

  const emptyMessage = `Nenhum pedido em «${SALES_ORDER_LIST_TAB_LABELS[tab]}»${
    search ? " para esta busca." : "."
  }`;

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar nº, cliente, data, código ou produto do pedido…"
        />
      }
      error={
        error ? (
          <CronogramaError message={error.message} onRetry={() => void refetch()} />
        ) : null
      }
      footer={
        data?.pagination?.total ? (
          <CronogramaPagination
            page={page}
            totalPages={totalPages}
            rangeDescription={rangeDescription}
            itemCount={data?.data?.length}
            onPageChange={setPage}
          />
        ) : null
      }
    >
      <SortableTable
        columns={tableColumns}
        data={data?.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        actionsColumn={{
          label: "Acções",
          width: "w-[5rem]",
          render: (row) => {
            const st = row.status as SalesOrderStatus;
            const canCancel =
              isAdmin && st !== "delivered" && st !== "cancelled";
            const canReactivate = isAdmin && st === "cancelled";
            return (
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
            );
          },
        }}
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Pedidos de venda"
      description="Cronograma comercial — prazos de entrega, produção e situação PCP."
      width="wide"
      density="comfortable"
      actions={
        isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/sales/orders/new")}
          >
            <Plus className="h-4 w-4" />
            Novo pedido
          </Button>
        ) : null
      }
    >
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {SALES_ORDER_LIST_TABS.map((tabId) => (
            <TabsTrigger key={tabId} value={tabId} className="text-xs sm:text-sm">
              {SALES_ORDER_LIST_TAB_LABELS[tabId]}
            </TabsTrigger>
          ))}
        </TabsList>

        {SALES_ORDER_LIST_TABS.map((tabId) => (
          <TabsContent key={tabId} value={tabId} className="mt-4">
            {listPanel}
          </TabsContent>
        ))}
      </Tabs>

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
    </AppPage>
  );
}
