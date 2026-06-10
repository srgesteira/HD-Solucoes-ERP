"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  SortableTable,
  type SortableTableColumn,
} from "@/shared/ui/sortable-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { usePermissions } from "@/hooks/use-permissions";

type QuoteStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "converted"
  | "revision";

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

const STATUS_OPTIONS: Array<{ value: "all" | QuoteStatus; label: string }> = [
  { value: "all", label: "Todos os estados" },
  { value: "draft", label: "Rascunho" },
  { value: "sent", label: "Enviado" },
  { value: "approved", label: "Aprovado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "converted", label: "Convertido" },
  { value: "revision", label: "Em revisão" },
];

const TAB_OPTIONS: Array<{ value: QuoteTab; label: string }> = [
  { value: "all", label: "Todos os orçamentos" },
  { value: "converted", label: "Orçamentos convertidos" },
  { value: "open", label: "Orçamentos em aberto" },
];

const quotesQueryKey = (filters: {
  tab: QuoteTab;
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}) => ["sales-quotes", filters] as const;

async function fetchQuotes(filters: {
  tab: QuoteTab;
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}): Promise<QuotesApiResponse> {
  const params = new URLSearchParams();
  if (filters.tab === "converted") {
    params.append("status_group", "converted");
  } else if (filters.tab === "open") {
    params.append("status_group", "open");
  } else if (filters.status !== "all") {
    params.append("status", filters.status);
  }
  if (filters.search.trim()) params.append("search", filters.search.trim());
  if (filters.dateFrom.trim()) params.append("date_from", filters.dateFrom.trim());
  if (filters.dateTo.trim()) params.append("date_to", filters.dateTo.trim());
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
  const d = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function QuotesListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { can } = usePermissions();
  const isAdmin = me?.role === "admin";
  const canEditQuotes = isAdmin || can("sales");

  const [activeTab, setActiveTab] = useState<QuoteTab>("all");
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

  const queryFilters = useMemo(
    () => ({ ...filters, tab: activeTab }),
    [filters, activeTab]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: quotesQueryKey(queryFilters),
    queryFn: () => fetchQuotes(queryFilters),
  });

  const [rejectTarget, setRejectTarget] = useState<QuoteRow | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
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

  const invalidateQuotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
  };

  const handleTabChange = (tab: string) => {
    const next = tab as QuoteTab;
    setActiveTab(next);
    setFilters((f) => ({ ...f, page: 1, status: "all" }));
  };

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
          const needsCommercial = Boolean(row.awaiting_commercial_finalize);
          return (
            <>
              <span className="font-medium text-slate-900 whitespace-nowrap">
                {formatQuoteNumberWithRevision(
                  row.quote_number,
                  row.revision_number,
                )}
              </span>
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
          <span className="text-slate-800 line-clamp-2">{row.client_name}</span>
        ),
      },
      {
        key: "quote_date",
        label: "Data",
        type: "date",
        width: "w-[10%]",
        accessor: (row) => row.quote_date,
        render: (row) => (
          <span className="text-slate-700 tabular-nums whitespace-nowrap">
            {formatDate(row.quote_date)}
          </span>
        ),
      },
      {
        key: "valid_until",
        label: "Validade",
        type: "date",
        width: "w-[10%]",
        accessor: (row) => row.valid_until,
        render: (row) => (
          <span className="text-slate-700 tabular-nums whitespace-nowrap">
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
          <span className="tabular-nums text-slate-800">
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
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                sb.className
              )}
            >
              {sb.label}
            </span>
          );
        },
      },
    ];
  }, []);

  const emptyMessage = "Nenhum orçamento encontrado para estes filtros.";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Orçamentos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Propostas comerciais — filtros e conversão em pedido de venda.
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/sales/quotes/new")}
          >
            <Plus className="h-4 w-4" />
            Novo orçamento
          </Button>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto flex flex-wrap h-auto gap-1">
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-semibold">
                <FileText className="h-5 w-5 text-slate-600" aria-hidden />
                {TAB_OPTIONS.find((t) => t.value === activeTab)?.label ?? "Listagem"}
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
                      placeholder="Buscar por nº do orçamento ou cliente…"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 flex-wrap sm:items-center">
                    {activeTab === "all" ? (
                      <select
                        className={cn(
                          "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[11rem]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:bg-slate-950 dark:border-slate-600"
                        )}
                        aria-label="Filtrar por estado"
                        value={filters.status}
                        onChange={(e) =>
                          setFilters({ ...filters, status: e.target.value, page: 1 })
                        }
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-slate-500 sr-only">
                        Data inicial do orçamento
                      </label>
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
                      <label className="text-xs text-slate-500 sr-only">
                        Data final do orçamento
                      </label>
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

                {data?.pagination?.total !== undefined && data.pagination.total > 0 ? (
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
                    <p className="text-sm text-slate-500">
                      Orçamentos nesta página: {data.data.length}. Intervalo total:{" "}
                      <span className="font-medium text-slate-700">{rangeDescription}</span>
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
    </div>
  );
}
