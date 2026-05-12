"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

type QuoteStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "converted";

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
      typeof json.error === "string" ? json.error : "Erro ao carregar orçamentos";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json as QuotesApiResponse;
}

async function patchQuoteStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar orçamento");
}

async function convertQuote(id: string): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${id}/convert`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao converter orçamento");
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

function statusBadge(status: string): { label: string; className: string } {
  switch (status as QuoteStatus) {
    case "draft":
      return {
        label: "Rascunho",
        className:
          "bg-slate-100 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-600",
      };
    case "sent":
      return {
        label: "Enviado",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700/50",
      };
    case "approved":
      return {
        label: "Aprovado",
        className:
          "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    case "rejected":
      return {
        label: "Rejeitado",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    case "converted":
      return {
        label: "Convertido",
        className:
          "bg-blue-50 text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

export default function QuotesListPage() {
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
    queryKey: quotesQueryKey(filters),
    queryFn: () => fetchQuotes(filters),
  });

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<QuoteRow | null>(null);
  const [convertBusy, setConvertBusy] = useState(false);

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

  const handleStatusAction = async (row: QuoteRow, status: string, labelOk: string) => {
    if (!isAdmin) return;
    try {
      await patchQuoteStatus(row.id, status);
      toast.success(labelOk);
      setMenuOpenFor(null);
      await invalidateQuotes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível atualizar o orçamento."
      );
    }
  };

  const handleConfirmConvert = async () => {
    if (!convertTarget || !isAdmin) return;
    setConvertBusy(true);
    try {
      await convertQuote(convertTarget.id);
      toast.success("Orçamento convertido em pedido de venda.");
      setConvertTarget(null);
      setMenuOpenFor(null);
      await invalidateQuotes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível converter o orçamento."
      );
    } finally {
      setConvertBusy(false);
    }
  };

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
                placeholder="Buscar por nº do orçamento ou cliente…"
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

          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white dark:bg-slate-950 dark:border-slate-800">
            <table className="w-full text-sm text-left min-w-[880px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800">
                  <th className="px-3 py-2.5 font-medium text-slate-700">
                    Nº orçamento
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
                    Acções
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        A carregar…
                      </span>
                    </td>
                  </tr>
                ) : !data?.data?.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      Nenhum orçamento encontrado para estes filtros.
                    </td>
                  </tr>
                ) : (
                  data.data.map((row) => {
                    const sb = statusBadge(row.status);
                    const st = row.status as QuoteStatus;
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
                        <td className="px-3 py-2.5 text-right relative">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            aria-expanded={menuOpenFor === row.id}
                            aria-label="Abrir menu de acções"
                            onClick={() =>
                              setMenuOpenFor((id) => (id === row.id ? null : row.id))
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
                                    router.push(`/sales/quotes/${row.id}`);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                  Visualizar
                                </button>
                                {isAdmin && st === "draft" ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                                    onClick={() => {
                                      setMenuOpenFor(null);
                                      router.push(`/sales/quotes/${row.id}/edit`);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                    Editar
                                  </button>
                                ) : null}
                                {isAdmin && st === "draft" ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                                    onClick={() =>
                                      void handleStatusAction(
                                        row,
                                        "sent",
                                        "Orçamento marcado como enviado."
                                      )
                                    }
                                  >
                                    <Send className="h-4 w-4" />
                                    Enviar
                                  </button>
                                ) : null}
                                {isAdmin &&
                                (st === "draft" || st === "sent") ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                    onClick={() =>
                                      void handleStatusAction(
                                        row,
                                        "approved",
                                        "Orçamento aprovado."
                                      )
                                    }
                                  >
                                    <Check className="h-4 w-4" />
                                    Aprovar
                                  </button>
                                ) : null}
                                {isAdmin &&
                                (st === "draft" || st === "sent") ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                    onClick={() =>
                                      void handleStatusAction(
                                        row,
                                        "rejected",
                                        "Orçamento rejeitado."
                                      )
                                    }
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Rejeitar
                                  </button>
                                ) : null}
                                {isAdmin && st === "approved" ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                                    onClick={() => {
                                      setMenuOpenFor(null);
                                      setConvertTarget(row);
                                    }}
                                  >
                                    <ArrowRightLeft className="h-4 w-4" />
                                    Converter para pedido
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

      {convertTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-convert-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:bg-slate-950 dark:border-slate-700">
            <h3
              id="quote-convert-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Converter em pedido de venda
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              O orçamento{" "}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {convertTarget.quote_number}
              </strong>{" "}
              será convertido: será criado um pedido de venda, contas a receber e
              eventual ordem de produção para produtos acabados.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={convertBusy}
                onClick={() => setConvertTarget(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={convertBusy}
                onClick={() => void handleConfirmConvert()}
              >
                {convertBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A processar…
                  </>
                ) : (
                  "Confirmar conversão"
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
