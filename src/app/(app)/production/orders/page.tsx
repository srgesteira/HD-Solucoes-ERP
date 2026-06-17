"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Edit,
  Eye,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { AppPage } from "@/shared/ui/app-page";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  CRONOGRAMA_TOKENS,
  CronogramaError,
  CronogramaPagination,
  CronogramaPanel,
  CronogramaSearch,
  useCronogramaSearch,
} from "@/shared/ui/cronograma-layout";
import { cn } from "@/shared/utils/cn";
import { formatShortDate } from "@/shared/utils/date";
import { useMe } from "@/hooks/use-me";

type ProductionTab =
  | "all"
  | "imported"
  | "planning"
  | "in_production"
  | "ready"
  | "finished"
  | "delayed"
  | "cancelled";

interface ProductionOrder {
  id: string;
  order_number: string;
  client_name: string | null;
  status: string;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  production_deadline: string | null;
  created_at: string;
}

interface OrdersApiResponse {
  data: ProductionOrder[];
  pagination: { page: number; limit: number; total: number };
}

const TAB_OPTIONS: Array<{ value: ProductionTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "imported", label: "Importados" },
  { value: "planning", label: "Planeamento" },
  { value: "in_production", label: "Em produção" },
  { value: "ready", label: "Prontos" },
  { value: "finished", label: "Finalizados" },
  { value: "delayed", label: "Atrasados" },
  { value: "cancelled", label: "Cancelados" },
];

const filtersKey = (f: {
  tab: ProductionTab;
  search: string;
  page: number;
  limit: number;
}) => ["production-orders", f] as const;

async function fetchOrders(filters: {
  tab: ProductionTab;
  search: string;
  page: number;
  limit: number;
}): Promise<OrdersApiResponse> {
  const params = new URLSearchParams();
  if (filters.tab !== "all") params.append("status", filters.tab);
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/production/orders?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as OrdersApiResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar pedidos");
  }
  return json;
}

async function deleteOrder(id: string): Promise<void> {
  const res = await fetch(`/api/production/orders/${id}`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao remover pedido");
  }
}

const statusLabel: Record<string, string> = {
  imported: "Importado",
  planning: "Planeamento",
  in_production: "Em produção",
  ready: "Pronto",
  finished: "Finalizado",
  delayed: "Atrasado",
  cancelled: "Cancelado",
};

const statusPillClass: Record<string, string> = {
  imported: "bg-slate-100 text-slate-800 ring-slate-200",
  planning: "bg-blue-50 text-blue-800 ring-blue-200",
  in_production: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ready: "bg-amber-50 text-amber-900 ring-amber-200",
  finished: "bg-slate-100 text-slate-600 ring-slate-200",
  delayed: "bg-red-50 text-red-800 ring-red-200",
  cancelled: "bg-slate-200 text-slate-700 ring-slate-300",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const formatted = formatShortDate(iso.slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

function isDeliveryOverdue(order: ProductionOrder): boolean {
  if (!order.delivery_deadline) return false;
  if (order.status === "finished" || order.status === "cancelled") {
    return false;
  }
  const s = order.delivery_deadline.slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return false;
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export default function ProductionOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [activeTab, setActiveTab] = useState<ProductionTab>("all");
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    setPage(1);
  }, [search, activeTab]);

  const queryFilters = useMemo(
    () => ({ tab: activeTab, search, page, limit }),
    [activeTab, search, page, limit]
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: filtersKey(queryFilters),
    queryFn: () => fetchOrders(queryFilters),
  });

  const handleDelete = useCallback(
    async (id: string, orderNumber: string) => {
      if (typeof window === "undefined") return;
      if (!window.confirm(`Remover definitivamente o pedido ${orderNumber}?`)) {
        return;
      }
      try {
        await deleteOrder(id);
        toast.success("Pedido removido.");
        await queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover pedido.");
      }
    },
    [queryClient]
  );

  const total = data?.pagination?.total ?? 0;
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;

  const rangeDescription = useMemo(() => {
    if (!total) return "";
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    return `${start}–${end} de ${total}`;
  }, [total, page, limit]);

  const tableColumns = useMemo((): SortableTableColumn<ProductionOrder>[] => {
    return [
      {
        key: "order_number",
        label: "Nº pedido",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.order_number,
        truncate: false,
        render: (row) => (
          <Link
            href={`/production/orders/${row.id}`}
            className={CRONOGRAMA_TOKENS.cellLink}
          >
            {row.order_number}
          </Link>
        ),
      },
      {
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => row.client_name,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>
            {row.client_name ?? "—"}
          </span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => statusLabel[row.status] ?? row.status,
        truncate: false,
        render: (row) => {
          const overdue = isDeliveryOverdue(row);
          const pillClass =
            statusPillClass[row.status] ??
            "bg-slate-100 text-slate-700 ring-slate-200";
          const label = statusLabel[row.status] ?? row.status;
          return (
            <span
              className={cn(
                CRONOGRAMA_TOKENS.badge,
                "inline-flex items-center gap-1",
                pillClass
              )}
            >
              {(overdue || row.status === "delayed") && (
                <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
              )}
              {label}
            </span>
          );
        },
      },
      {
        key: "delivery_deadline",
        label: "Entrega prevista",
        type: "date",
        width: "w-[14%]",
        accessor: (row) => row.delivery_deadline,
        truncate: false,
        render: (row) => {
          const overdue = isDeliveryOverdue(row);
          return (
            <div className="flex items-center gap-1.5">
              {overdue ? (
                <AlertCircle
                  className="h-3.5 w-3.5 shrink-0 text-red-600"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  CRONOGRAMA_TOKENS.cellMuted,
                  overdue && "text-red-700 font-medium"
                )}
              >
                {formatDate(row.delivery_deadline)}
              </span>
            </div>
          );
        },
      },
      {
        key: "created_at",
        label: "Criação",
        type: "date",
        width: "w-[12%]",
        accessor: (row) => row.created_at,
        truncate: false,
        render: (row) => (
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
            {formatDate(row.created_at)}
          </span>
        ),
      },
    ];
  }, []);

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar nº pedido, cliente ou data…"
        />
      }
      error={
        error ? (
          <CronogramaError
            message={(error as Error).message}
            onRetry={() => void refetch()}
          />
        ) : null
      }
      footer={
        total > 0 ? (
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
        emptyMessage="Nenhum pedido encontrado."
        actionsColumn={{
          label: "Ações",
          width: "w-[5rem]",
          render: (order) => (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                title="Ver"
                aria-label={`Ver pedido ${order.order_number}`}
                onClick={() => router.push(`/production/orders/${order.id}`)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                title="Editar"
                aria-label={`Editar pedido ${order.order_number}`}
                onClick={() =>
                  router.push(`/production/orders/${order.id}/edit`)
                }
              >
                <Edit className="h-4 w-4" />
              </Button>
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 border-red-200 text-red-700 hover:bg-red-50"
                  title="Remover"
                  aria-label={`Remover pedido ${order.order_number}`}
                  disabled={isFetching}
                  onClick={() =>
                    void handleDelete(order.id, order.order_number)
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ),
        }}
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Pedidos de produção"
      description="Cronograma operacional — prazos, estados e planeamento PCP."
      density="comfortable"
      width="wide"
      actions={
        <Button size="sm" onClick={() => router.push("/production/orders/new")}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo pedido
        </Button>
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as ProductionTab);
          setPage(1);
        }}
      >
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TAB_OPTIONS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {listPanel}
          </TabsContent>
        ))}
      </Tabs>
    </AppPage>
  );
}
