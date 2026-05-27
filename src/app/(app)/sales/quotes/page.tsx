"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Loader2, Plus, Search } from "lucide-react";
import {
  QuoteRowActionsMenu,
  type QuoteRowActionsQuote,
} from "@/components/sales/quote-row-actions-menu";
import { QuoteRejectModal } from "@/components/sales/quote-reject-modal";
import { quoteStatusBadge } from "@/modules/vendas/lib/sales/quote-display";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
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

interface QuoteRow {
  id: string;
  quote_number: string;
  client_name: string;
  quote_date: string;
  valid_until: string | null;
  total: number;
  status: string;
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
  { value: "revision", label: "Em revisÃ£o" },
];

const quotesQueryKey = (filters: {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}) => ["sales-quotes", filters] as const;

async function fetchQuotes(filters: {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}): Promise<QuotesApiResponse> {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.append("status", filters.status);
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
      typeof json.error === "string" ? json.error : "Erro ao carregar orÃ§amentos";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta invÃ¡lida da API");
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
  if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar orÃ§amento");
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
  if (!res.ok) throw new Error(json.error ?? "Erro ao aprovar orÃ§amento");
  if (!json.data?.sales_order_id) {
    throw new Error("Resposta invÃ¡lida ao aprovar");
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
  if (!res.ok) throw new Error(json.error ?? "Erro ao rejeitar orÃ§amento");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "â€”";
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
    queryKey: quotesQueryKey(filters),
    queryFn: () => fetchQuotes(filters),
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
    return `${start}â€“${end} de ${total}`;
  }, [data?.pagination, filters.page, filters.limit]);

  const invalidateQuotes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales-quotes"] });
  };

  const handleStatusAction = async (
    row: QuoteRowActionsQuote,
    status: string,
    labelOk: string
  ) => {
    if (!isAdmin) return;
    try {
      await patchQuote(row.id, { status });
      toast.success(labelOk);
      await invalidateQuotes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "NÃ£o foi possÃ­vel atualizar o orÃ§amento."
      );
    }
  };

  const handleApprove = async (row: QuoteRowActionsQuote) => {
    if (!isAdmin) return;
    setApproveBusyId(row.id);
    try {
      const { sales_order_id } = await approveQuote(row.id);
      toast.success("OrÃ§amento aprovado e pedido de venda criado.");
      await invalidateQuotes();
      router.push(`/sales/orders/${sales_order_id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "NÃ£o foi possÃ­vel aprovar o orÃ§amento."
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
      toast.success("OrÃ§amento rejeitado.");
      setRejectTarget(null);
      await invalidateQuotes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "NÃ£o foi possÃ­vel rejeitar o orÃ§amento."
      );
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">OrÃ§amentos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Propostas comerciais â€” filtros e conversÃ£o em pedido de venda.
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/sales/quotes/new")}
          >
            <Plus className="h-4 w-4" />
            Novo orÃ§amento
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <FileText className="h-5 w-5 text-slate-600" aria-hidden />
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
                placeholder="Buscar por nÂº do orÃ§amento ou clienteâ€¦"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap sm:items-center">
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
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500 sr-only">
                  Data inicial do orÃ§amento
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
                <span className="text-slate-400 text-sm">atÃ©</span>
                <label className="text-xs text-slate-500 sr-only">
                  Data final do orÃ§amento
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

          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white dark:bg-slate-950 dark:border-slate-800">
            <table className="w-full text-sm text-left min-w-[880px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800">
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    NÂº orÃ§amento
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Cliente
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Data
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Validade
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Total
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Estado
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right w-[8rem]">
                    AcÃ§Ãµes
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        A carregarâ€¦
                      </span>
                    </td>
                  </tr>
                ) : !data?.data?.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      Nenhum orÃ§amento encontrado para estes filtros.
                    </td>
                  </tr>
                ) : (
                  data.data.map((row) => {
                    const sb = quoteStatusBadge(row.status);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {row.quote_number}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[14rem]">
                          <span className="line-clamp-2">{row.client_name}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatDate(row.quote_date)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatDate(row.valid_until)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(row.total)}
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
                        <td className="px-3 py-2.5 text-right">
                          <QuoteRowActionsMenu
                            row={row}
                            isAdmin={isAdmin}
                            canEditQuotes={canEditQuotes}
                            onStatusAction={handleStatusAction}
                            onApprove={handleApprove}
                            onReject={(r) => setRejectTarget(r as QuoteRow)}
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
                OrÃ§amentos nesta pÃ¡gina: {data.data.length}. Intervalo total:{" "}
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
                  aria-label="PÃ¡gina anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm tabular-nums px-2 text-slate-600">
                  PÃ¡gina {filters.page} / {totalPages}
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
                  aria-label="PÃ¡gina seguinte"
                >
                  Seguinte
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
            Voltar Ã s tarefas
          </Link>
        </p>
      ) : null}
    </div>
  );
}
