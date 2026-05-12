"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useMe } from "@/hooks/use-me";

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

const filtersKey = (f: {
  status: string;
  search: string;
  page: number;
  limit: number;
}) => ["production-orders", f] as const;

async function fetchOrders(filters: {
  status: string;
  search: string;
  page: number;
  limit: number;
}): Promise<OrdersApiResponse> {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.append("status", filters.status);
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
  imported: "bg-slate-100 text-slate-800 border-slate-200",
  planning: "bg-blue-50 text-blue-800 border-blue-200",
  in_production: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ready: "bg-amber-50 text-amber-900 border-amber-200",
  finished: "bg-slate-100 text-slate-600 border-slate-200",
  delayed: "bg-red-50 text-red-800 border-red-200",
  cancelled: "bg-slate-200 text-slate-700 border-slate-300",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT");
}

/** Prazo de entrega (data-only) já passou e o pedido não está encerrado. */
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

  const [filters, setFilters] = useState({
    status: "all",
    search: "",
    page: 1,
    limit: 25,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: filtersKey(filters),
    queryFn: () => fetchOrders(filters),
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
  const totalPages =
    filters.limit > 0 ? Math.max(1, Math.ceil(total / filters.limit)) : 1;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 border border-brand-100">
            <ClipboardList className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Pedidos de produção
            </h1>
            <p className="text-sm text-slate-500">
              Lista e filtros dos pedidos do tenant.
            </p>
          </div>
        </div>
        <Button onClick={() => router.push("/production/orders/new")}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo pedido
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4">
          <CardTitle className="text-base font-semibold text-slate-900">
            Lista de pedidos
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Buscar por número ou cliente…"
                value={filters.search}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    search: e.target.value,
                    page: 1,
                  })
                }
                className="pl-9"
                aria-label="Pesquisar pedidos"
              />
            </div>
            <div className="w-full md:w-[220px] shrink-0">
              <label className="sr-only" htmlFor="prod-order-status">
                Estado
              </label>
              <select
                id="prod-order-status"
                value={filters.status}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: e.target.value,
                    page: 1,
                  })
                }
                className={cn(
                  "flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm",
                  "shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                )}
              >
                <option value="all">Todos</option>
                <option value="imported">Importados</option>
                <option value="planning">Planeamento</option>
                <option value="in_production">Em produção</option>
                <option value="ready">Prontos</option>
                <option value="finished">Finalizados</option>
                <option value="delayed">Atrasados</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {(error as Error).message}
            </p>
          ) : null}

          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th className="p-3">Nº pedido</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Entrega prevista</th>
                  <th className="p-3">Criação</th>
                  <th className="p-3 text-right w-[140px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        A carregar…
                      </span>
                    </td>
                  </tr>
                ) : !data?.data?.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-10 text-center text-slate-500"
                    >
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                ) : (
                  data.data.map((order) => {
                    const overdue = isDeliveryOverdue(order);
                    const pillClass =
                      statusPillClass[order.status] ??
                      "bg-slate-100 text-slate-700 border-slate-200";
                    const label =
                      statusLabel[order.status] ?? order.status;

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="p-3 font-mono font-medium text-slate-900">
                          {order.order_number}
                        </td>
                        <td className="p-3 text-slate-800">
                          {order.client_name ?? "—"}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              pillClass
                            )}
                          >
                            {(overdue || order.status === "delayed") && (
                              <AlertCircle
                                className="h-3 w-3 shrink-0"
                                aria-hidden
                              />
                            )}
                            {label}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {overdue ? (
                              <AlertCircle
                                className="h-4 w-4 shrink-0 text-red-600"
                                aria-hidden
                              />
                            ) : null}
                            <span
                              className={cn(
                                overdue && "text-red-700 font-medium"
                              )}
                            >
                              {formatDate(order.delivery_deadline)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Ver"
                              aria-label={`Ver pedido ${order.order_number}`}
                              onClick={() =>
                                router.push(`/production/orders/${order.id}`)
                              }
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
                                router.push(
                                  `/production/orders/${order.id}/edit`
                                )
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
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {total > 0 ? (
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-center text-sm">
              <p className="text-slate-500">
                A mostrar {data?.data?.length ?? 0} de {total} pedidos
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))
                  }
                  disabled={filters.page <= 1 || isFetching}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-slate-600 tabular-nums px-2">
                  Página {filters.page} de {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      page:
                        f.page >= totalPages ? f.page : f.page + 1,
                    }))
                  }
                  disabled={filters.page >= totalPages || isFetching}
                >
                  Seguinte
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
