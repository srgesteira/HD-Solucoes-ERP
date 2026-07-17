"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { FiscalStatusBadge } from "@/components/fiscal/fiscal-status-badge";
import { Button } from "@/shared/ui/button";
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
import { fmtBRL } from "@/shared/utils/format-brl";
import type { FiscalInboundListRow } from "@/modules/faturamento/lib/fiscal-inbound-list-service";
import {
  FISCAL_INBOUND_LIST_TAB_DEFAULT,
  FISCAL_INBOUND_LIST_TAB_LABELS,
  FISCAL_INBOUND_LIST_TABS,
  isFiscalInboundListTab,
  type FiscalInboundListTab,
} from "@/modules/faturamento/lib/fiscal-inbound-list-tabs";
import { formatFiscalListDate } from "@/modules/faturamento/lib/fiscal-invoicing-list-display";
import { poStatusLabel } from "@/modules/compras/lib/purchasing/purchase-order-display";

export const fiscalInboundListQueryKey = (filters: {
  tab: FiscalInboundListTab;
  search: string;
  page: number;
  limit: number;
}) => ["fiscal-inbound-list", filters] as const;

type ApiResponse = {
  data: FiscalInboundListRow[];
  pagination: { page: number; limit: number; total: number };
  error?: string;
};

async function fetchInboundList(filters: {
  tab: FiscalInboundListTab;
  search: string;
  page: number;
  limit: number;
}): Promise<ApiResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  params.set("tab", filters.tab);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  const res = await fetch(`/api/faturamento/entrada?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Erro ao carregar entrada"
    );
  }
  return json;
}

async function postApplyFiscal(orderId: string): Promise<string | undefined> {
  const res = await fetch(`/api/faturamento/entrada/${orderId}/apply-fiscal`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    fiscalStatus?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao aplicar fiscal");
  return json.fiscalStatus;
}

type Props = {
  enabled?: boolean;
  initialTab?: string | null;
  onTabChange?: (tab: FiscalInboundListTab) => void;
};

export function FiscalInboundListPanel({
  enabled = true,
  initialTab,
  onTabChange,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FiscalInboundListTab>(() =>
    initialTab && isFiscalInboundListTab(initialTab)
      ? initialTab
      : FISCAL_INBOUND_LIST_TAB_DEFAULT
  );
  const { input: searchInput, setInput: setSearchInput, debounced: search } =
    useCronogramaSearch();
  const [page, setPage] = useState(1);
  const limit = 25;
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab && isFiscalInboundListTab(initialTab) && initialTab !== tab) {
      setTab(initialTab);
    }
    // sync from URL only when prop changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  const queryFilters = useMemo(
    () => ({ search, tab, page, limit }),
    [search, tab, page, limit]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: fiscalInboundListQueryKey(queryFilters),
    queryFn: () => fetchInboundList(queryFilters),
    enabled,
    staleTime: 30_000,
  });

  const applyMutation = useMutation({
    mutationFn: postApplyFiscal,
    onSuccess: (status) => {
      toast.success(`Fiscal aplicado (${status ?? "ok"}).`);
      void queryClient.invalidateQueries({ queryKey: ["fiscal-inbound-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setApplyingId(null),
  });

  const totalPages = Math.max(
    1,
    Math.ceil((data?.pagination.total ?? 0) / limit)
  );
  const rangeDescription = useMemo(() => {
    const total = data?.pagination.total ?? 0;
    if (!total) return "0 registos";
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    return `${start}–${end} de ${total}`;
  }, [data?.pagination.total, page, limit]);

  const handleTabChange = (value: string) => {
    if (!isFiscalInboundListTab(value)) return;
    setTab(value);
    onTabChange?.(value);
  };

  const columns = useMemo<SortableTableColumn<FiscalInboundListRow>[]>(
    () => [
      {
        key: "order_number",
        label: "Pedido",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.order_number,
        render: (row) => (
          <Link
            href={`/faturamento/entrada/${row.id}`}
            className="font-medium text-emerald-800 hover:underline"
          >
            {row.order_number}
          </Link>
        ),
      },
      {
        key: "supplier_name",
        label: "Fornecedor",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => row.supplier_name ?? "",
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {row.supplier_name ?? "—"}
          </span>
        ),
      },
      {
        key: "order_date",
        label: "Data pedido",
        type: "date",
        width: "w-[10%]",
        accessor: (row) => row.order_date,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {formatFiscalListDate(row.order_date)}
          </span>
        ),
      },
      {
        key: "total",
        label: "Valor total",
        type: "number",
        width: "w-[12%]",
        accessor: (row) => row.total,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellMuted}>
            {fmtBRL(row.total)}
            {row.freight_cost && row.freight_cost > 0
              ? ` · frete ${fmtBRL(row.freight_cost)}`
              : ""}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status PC",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => row.status,
        render: (row) => (
          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {poStatusLabel(row.status)}
          </span>
        ),
      },
      {
        key: "fiscal_status",
        label: "Fiscal",
        type: "text",
        width: "w-[14%]",
        accessor: (row) => row.fiscal_status ?? "",
        render: (row) => (
          <FiscalStatusBadge status={row.fiscal_status ?? "pending"} />
        ),
      },
    ],
    []
  );

  const emptyMessage = `Nenhum pedido em «${FISCAL_INBOUND_LIST_TAB_LABELS[tab]}»${
    search ? " para esta busca." : "."
  }`;

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList className="w-full flex flex-wrap h-auto gap-1">
        {FISCAL_INBOUND_LIST_TABS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {FISCAL_INBOUND_LIST_TAB_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>

      {FISCAL_INBOUND_LIST_TABS.map((key) => (
        <TabsContent key={key} value={key} className="mt-0 space-y-4">
          {tab === key ? (
            <CronogramaPanel
              search={
                <CronogramaSearch
                  value={searchInput}
                  onChange={setSearchInput}
                  placeholder="Buscar nº do pedido de compra…"
                />
              }
              error={
                error ? (
                  <CronogramaError
                    message={error.message}
                    onRetry={() => void refetch()}
                  />
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
                columns={columns}
                data={data?.data ?? []}
                getRowKey={(row) => row.id}
                isLoading={isLoading}
                emptyMessage={emptyMessage}
                rowClassName={(row) =>
                  tab === "received" && !row.fiscal_finalized_at
                    ? "bg-amber-50/40"
                    : ""
                }
                actionsColumn={{
                  label: "Acções",
                  width: "w-[11rem]",
                  render: (row) => {
                    const showApply =
                      !row.fiscal_finalized_at &&
                      (row.status === "sent" ||
                        row.status === "confirmed" ||
                        row.status === "partial" ||
                        row.status === "received");
                    return (
                      <div className="flex flex-wrap items-center gap-1">
                        {showApply ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={applyingId === row.id}
                            title="Aplicar motor fiscal (NCM/CFOP/alíquotas)"
                            onClick={() => {
                              setApplyingId(row.id);
                              applyMutation.mutate(row.id);
                            }}
                          >
                            {applyingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            Aplicar
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            router.push(`/faturamento/entrada/${row.id}`)
                          }
                        >
                          Conferir
                        </Button>
                      </div>
                    );
                  },
                }}
              />
            </CronogramaPanel>
          ) : null}
        </TabsContent>
      ))}

      <p className={cn("text-xs text-slate-500")}>
        Ao receber o PC em Compras, o pedido passa para «Recebido». Ao finalizar
        a conferência fiscal, passa para «Finalizado».
      </p>
    </Tabs>
  );
}
