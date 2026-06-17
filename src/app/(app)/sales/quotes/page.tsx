"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  QuoteRowActionsMenu,
  type QuoteRowActionsQuote,
} from "@/components/sales/quote-row-actions-menu";
import { QuoteRejectModal } from "@/components/sales/quote-reject-modal";
import {
  formatQuoteNumberWithRevision,
  quoteStatusBadge,
} from "@/modules/vendas/lib/sales/quote-display";
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
import { formatShortDate } from "@/shared/utils/date";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

type QuoteTab = "all" | "converted" | "open";

interface QuoteRow {
  id: string;
  quote_number: string;
  revision_number?: number | null;
  client_name: string;
  quote_date: string;
  valid_until: string | null;
  total: number;
  status: string;
  awaiting_commercial_finalize?: boolean;
}

interface QuotesApiResponse {
  data: QuoteRow[];
  pagination: { page: number; limit: number; total: number };
}

const TAB_OPTIONS: Array<{ value: QuoteTab; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Em aberto" },
  { value: "converted", label: "Convertidos" },
];

const quotesQueryKey = (filters: {
  tab: QuoteTab;
  search: string;
  page: number;
  limit: number;
}) => ["sales-quotes", filters] as const;

async function fetchQuotes(filters: {
  tab: QuoteTab;
  search: string;
  page: number;
  limit: number;
}): Promise<QuotesApiResponse> {
  const params = new URLSearchParams();
  if (filters.tab === "converted") {
    params.append("status_group", "converted");
  } else if (filters.tab === "open") {
    params.append("status_group", "open");
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/sales/quotes?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as QuotesApiResponse & {
    error?: string;
  };

  if (!res.ok) {
    const errMsg =
      typeof json.error === "string" ? json.error : "Erro ao carregar orçamentos";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json as QuotesApiResponse;
}

async function patchQuoteField(
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao actualizar orçamento");
}

async function patchQuote(
  id: string,
  body: { status: string; revision_notes?: string | null }
): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar orçamento");
}

async function approveQuote(id: string): Promise<{ sales_order_id: string }> {
  const res = await fetch(`/api/sales/quotes/${id}/approve`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { sales_order_id: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Erro ao aprovar orçamento");
  if (!json.data?.sales_order_id) {
    throw new Error("Resposta inválida ao aprovar");
  }
  return json.data;
}

async function rejectQuoteApi(
  id: string,
  reasonIds: string[],
  notes: string
): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}/reject`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason_ids: reasonIds, notes: notes || null }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao rejeitar orçamento");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

export default function QuotesListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEditQuotes = isAdmin || can("sales");

  const [activeTab, setActiveTab] = useState<QuoteTab>("all");
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: quotesQueryKey(queryFilters),
    queryFn: () => fetchQuotes(queryFilters),
  });

  const [rejectTarget, setRejectTarget] = useState<QuoteRow | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
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

  const invalidateQuotes = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
  }, [queryClient]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as QuoteTab);
    setPage(1);
  };

  const handleValidUntilChange = useCallback(
    async (row: QuoteRow, date: string | null) => {
      if (!canEditQuotes) return;
      try {
        await patchQuoteField(row.id, { valid_until: date });
        toast.success("Validade actualizada.");
        await invalidateQuotes();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Não foi possível actualizar a validade."
        );
      }
    },
    [canEditQuotes, invalidateQuotes]
  );

  const handleStatusAction = async (
    row: QuoteRowActionsQuote,
    status: string,
    labelOk: string
  ) => {
    if (status === "sent" ? !canEditQuotes : !isAdmin) return;
    try {
      await patchQuote(row.id, { status });
      toast.success(labelOk);
      await invalidateQuotes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível atualizar o orçamento."
      );
    }
  };

  const handleApprove = async (row: QuoteRowActionsQuote) => {
    if (!isAdmin) return;
    setApproveBusyId(row.id);
    try {
      const { sales_order_id } = await approveQuote(row.id);
      toast.success("Orçamento aprovado e pedido de venda criado.");
      await invalidateQuotes();
      router.push(`/sales/orders/${sales_order_id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível aprovar o orçamento."
      );
    } finally {
      setApproveBusyId(null);
    }
  };

  const handleSubmitReject = async (reasonIds: string[], notes: string) => {
    if (!rejectTarget || !isAdmin) return;
    setRejectBusy(true);
    try {
      await rejectQuoteApi(rejectTarget.id, reasonIds, notes);
      toast.success("Orçamento rejeitado.");
      setRejectTarget(null);
      await invalidateQuotes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível rejeitar o orçamento."
      );
    } finally {
      setRejectBusy(false);
    }
  };

  const tableColumns = useMemo((): SortableTableColumn<QuoteRow>[] => {
    return [
      {
        key: "quote_number",
        label: "Nº orçamento",
        type: "text",
        width: "w-[12%]",
        accessor: (row) =>
          formatQuoteNumberWithRevision(
            row.quote_number,
            row.revision_number,
          ),
        truncate: false,
        render: (row) => {
          const label = formatQuoteNumberWithRevision(
            row.quote_number,
            row.revision_number,
          );
          const needsCommercial = Boolean(row.awaiting_commercial_finalize);
          return (
            <>
              <Link
                href={`/sales/quotes/${row.id}`}
                className={CRONOGRAMA_TOKENS.cellLink}
              >
                {label}
              </Link>
              {needsCommercial ? (
                <span className="mt-1 block text-xs font-medium text-brand-800">
                  Custo disponível — rever markup
                </span>
              ) : null}
            </>
          );
        },
      },
      {
        key: "client_name",
        label: "Cliente",
        type: "text",
        width: "w-[22%]",
        accessor: (row) => row.client_name,
        render: (row) => (
          <span className={CRONOGRAMA_TOKENS.cellText}>{row.client_name}</span>
        ),
      },
      {
        key: "quote_date",
        label: "Data",
        type: "date",
        width: "w-[10%]",
        accessor: (row) => row.quote_date,
        truncate: false,
        render: (row) => (
          <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
            {formatDate(row.quote_date)}
          </span>
        ),
      },
      {
        key: "valid_until",
        label: "Validade",
        type: "date",
        width: "w-[12%]",
        accessor: (row) => row.valid_until,
        truncate: false,
        render: (row) =>
          canEditQuotes ? (
            <InlineDateEdit
              value={row.valid_until}
              onSave={(v) => handleValidUntilChange(row, v)}
            />
          ) : (
            <span className={`${CRONOGRAMA_TOKENS.cellMuted} whitespace-nowrap`}>
              {formatDate(row.valid_until)}
            </span>
          ),
      },
      {
        key: "total",
        label: "Total",
        type: "number",
        width: "w-[11%]",
        align: "right",
        accessor: (row) => row.total,
        truncate: false,
        render: (row) => (
          <span className="text-xs tabular-nums font-medium">
            {formatCurrency(row.total)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Estado",
        type: "text",
        width: "w-[12%]",
        accessor: (row) => quoteStatusBadge(row.status).label,
        truncate: false,
        render: (row) => {
          const sb = quoteStatusBadge(row.status);
          return (
            <span className={cn(CRONOGRAMA_TOKENS.badge, sb.className)}>
              {sb.label}
            </span>
          );
        },
      },
    ];
  }, [canEditQuotes, handleValidUntilChange]);

  const emptyMessage = "Nenhum orçamento encontrado.";

  const listPanel = (
    <CronogramaPanel
      search={
        <CronogramaSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar nº, cliente, data, código ou produto do orçamento…"
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
        rowClassName={(row) =>
          Boolean(row.awaiting_commercial_finalize)
            ? "bg-brand-50/80 animate-pulse ring-1 ring-inset ring-brand-400/60"
            : ""
        }
        actionsColumn={{
          label: "Ações",
          width: "w-[5rem]",
          render: (row) => (
            <QuoteRowActionsMenu
              row={row}
              isAdmin={isAdmin}
              canEditQuotes={canEditQuotes}
              onStatusAction={handleStatusAction}
              onApprove={handleApprove}
              onReject={(r) => setRejectTarget(r as QuoteRow)}
            />
          ),
        }}
      />
    </CronogramaPanel>
  );

  return (
    <AppPage
      title="Orçamentos"
      description="Cronograma comercial — propostas, prazos e conversão em pedido de venda."
      density="comfortable"
      width="wide"
      actions={
        isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/sales/quotes/new")}
          >
            <Plus className="h-4 w-4" />
            Novo orçamento
          </Button>
        ) : null
      }
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {listPanel}
        </TabsContent>
        <TabsContent value="open" className="mt-4">
          {listPanel}
        </TabsContent>
        <TabsContent value="converted" className="mt-4">
          {listPanel}
        </TabsContent>
      </Tabs>

      <QuoteRejectModal
        open={Boolean(rejectTarget)}
        quoteNumber={rejectTarget?.quote_number ?? ""}
        busy={rejectBusy}
        onClose={() => !rejectBusy && setRejectTarget(null)}
        onSubmit={handleSubmitReject}
      />

      {!isLoading && error == null ? (
        <p className="text-xs text-slate-500 text-center pb-8">
          <Link href="/boards" className="text-brand-700 underline">
            Voltar às tarefas
          </Link>
        </p>
      ) : null}
    </AppPage>
  );
}
