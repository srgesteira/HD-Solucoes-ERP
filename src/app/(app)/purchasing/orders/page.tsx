"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial"
  | "received"
  | "cancelled";

interface SupplierEmbedded {
  id: string;
  name: string;
  code: string | null;
}

interface PurchaseOrderRow {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery: string | null;
  total: number;
  status: string;
  supplier_id: string | null;
  supplier?: SupplierEmbedded | null;
}

interface PurchaseOrdersApiResponse {
  data: PurchaseOrderRow[];
  pagination: { page: number; limit: number; total: number };
}

const STATUS_OPTIONS: Array<{ value: "all" | PurchaseOrderStatus; label: string }> =
  [
    { value: "all", label: "Todos os estados" },
    { value: "draft", label: "Rascunho" },
    { value: "sent", label: "Enviado" },
    { value: "confirmed", label: "Confirmado" },
    { value: "partial", label: "Parcial" },
    { value: "received", label: "Recebido" },
    { value: "cancelled", label: "Cancelado" },
  ];

const ordersQueryKey = (filters: {
  status: string;
  search: string;
  page: number;
  limit: number;
}) => ["purchasing-orders", filters] as const;

async function fetchOrders(filters: {
  status: string;
  search: string;
  page: number;
  limit: number;
}): Promise<PurchaseOrdersApiResponse> {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.append("status", filters.status);
  if (filters.search.trim()) params.append("search", filters.search.trim());
  params.append("page", String(filters.page));
  params.append("limit", String(filters.limit));

  const res = await fetch(`/api/purchasing/orders?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as PurchaseOrdersApiResponse & {
    error?: string;
    detail?: unknown;
  };

  if (!res.ok) {
    const errMsg =
      typeof json.error === "string" ? json.error : "Erro ao carregar pedidos de compra";
    throw new Error(errMsg);
  }

  if (!json.data || !json.pagination) {
    throw new Error("Resposta inválida da API");
  }

  return json as PurchaseOrdersApiResponse;
}

async function cancelPurchaseOrder(id: string): Promise<void> {
  const res = await fetch(`/api/purchasing/orders/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Erro ao cancelar pedido");
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
  switch (status as PurchaseOrderStatus) {
    case "draft":
      return {
        label: "Rascunho",
        className: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
      };
    case "sent":
      return {
        label: "Enviado",
        className:
          "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        className: "bg-blue-50 text-blue-900 ring-1 ring-blue-200",
      };
    case "partial":
      return {
        label: "Parcial",
        className: "bg-orange-50 text-orange-900 ring-1 ring-orange-200",
      };
    case "received":
      return {
        label: "Recebido",
        className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        className: "bg-red-50 text-red-800 ring-1 ring-red-200",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
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
    queryKey: ordersQueryKey(filters),
    queryFn: () => fetchOrders(filters),
  });

  const [cancelTarget, setCancelTarget] = useState<PurchaseOrderRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const handleConfirmCancel = async () => {
    if (!cancelTarget || !isAdmin) return;
    setCancelBusy(true);
    try {
      await cancelPurchaseOrder(cancelTarget.id);
      toast.success("Pedido cancelado.");
      setCancelTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["purchasing-orders"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível cancelar o pedido."
      );
    } finally {
      setCancelBusy(false);
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
          <h2 className="text-2xl font-semibold text-slate-900">Pedidos de compra</h2>
          <p className="text-sm text-slate-500 mt-1">
            Pedidos ao fornecedor — totais e estados por linha.
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/purchasing/orders/new")}
          >
            <Plus className="h-4 w-4" />
            Novo pedido de compra
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-5 w-5 text-slate-600" aria-hidden />
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
                placeholder="Buscar por número do pedido…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <select
                className={cn(
                  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[11rem]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
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
            <table className="w-full text-sm text-left min-w-[840px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2.5 font-medium text-slate-700">Nº pedido</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Fornecedor</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Data pedido</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Data prevista</th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Total
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700">Estado</th>
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
                      Nenhum pedido encontrado para estes filtros.
                    </td>
                  </tr>
                ) : (
                  data.data.map((row) => {
                    const sb = statusBadge(row.status);
                    const supplierName =
                      row.supplier?.name?.trim() ||
                      (row.supplier_id ? "—" : "Sem fornecedor");
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {row.po_number}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-[14rem]">
                          <span className="line-clamp-2">{supplierName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatDate(row.order_date)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                          {formatDate(row.expected_delivery)}
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
                              <div className="absolute right-3 top-full z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                  onClick={() => {
                                    setMenuOpenFor(null);
                                    router.push(`/purchasing/orders/${row.id}`);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                  Ver detalhes
                                </button>
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                    onClick={() => {
                                      setMenuOpenFor(null);
                                      router.push(`/purchasing/orders/${row.id}/edit`);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                    Editar
                                  </button>
                                ) : null}
                                {isAdmin && row.status !== "cancelled" ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                      setMenuOpenFor(null);
                                      setCancelTarget(row);
                                    }}
                                  >
                                    <Ban className="h-4 w-4" />
                                    Cancelar pedido
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

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="po-cancel-title"
        >
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="po-cancel-title" className="text-lg font-semibold text-slate-900">
              Cancelar pedido de compra
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              O pedido{" "}
              <strong className="font-medium text-slate-900">
                {cancelTarget.po_number}
              </strong>{" "}
              passará ao estado «Cancelado».
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cancelBusy}
                onClick={() => setCancelTarget(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={cancelBusy}
                onClick={() => void handleConfirmCancel()}
              >
                {cancelBusy ? (
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
          <Link href="/boards" className="text-brand-700 underline">
            Voltar às tarefas
          </Link>
        </p>
      ) : null}
    </div>
  );
}
