"use client";

import {
  addDays,
  differenceInDays,
  format,
  isWeekend,
  parseISO,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  FileText,
  Loader2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, Fragment } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AppPage } from "@/shared/ui/app-page";
import { StatusBadge } from "@/shared/ui/page-helpers";
import { cn } from "@/shared/utils/cn";
import { useMe } from "@/hooks/use-me";
import { ProductionOrderCancelModal } from "@/components/production/production-order-cancel-modal";
import type { ProductionCancellationReason } from "@/modules/reverse/lib/returns-types";

const GANTT_MAX_COLS = 60;

interface OrderItem {
  id: string;
  item_number: number | null;
  description: string;
  quantity: number;
  unit: string | null;
  status: string;
  production_start: string | null;
  production_end: string | null;
  line_id: string | null;
  line?: { id: string; name: string; code: string } | null;
  product?: {
    id: string;
    code: string | null;
    technical_code?: string | null;
    name: string;
  } | null;
  operations?: OrderItemOperation[];
}

interface OrderItemOperation {
  id: string;
  sequence: number;
  name: string;
  status: string;
  planned_duration_minutes: number | null;
}

interface ProductionOrder {
  id: string;
  order_number: string;
  client_name: string | null;
  client_document: string | null;
  description: string | null;
  status: string;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  production_deadline: string | null;
  notes: string | null;
  created_at: string;
  items?: OrderItem[];
}

async function fetchOrder(id: string): Promise<ProductionOrder> {
  const res = await fetch(`/api/production/orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ProductionOrder;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao carregar pedido");
  }
  if (!json.data) throw new Error("Resposta sem dados");
  return json.data;
}

async function updateItemStatus(
  orderId: string,
  itemId: string,
  status: string
) {
  const res = await fetch(
    `/api/production/orders/${orderId}/items?itemId=${encodeURIComponent(itemId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      credentials: "include",
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao atualizar item");
  }
  return json;
}

async function updateOperationStatus(operationId: string, status: string) {
  const res = await fetch(
    `/api/production/order-item-operations/${operationId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      credentials: "include",
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao atualizar operação");
  }
  return json;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  waiting: {
    label: "Aguardando",
    className: "bg-slate-100 text-slate-800 border-slate-200",
  },
  scheduled: {
    label: "Agendado",
    className: "bg-blue-50 text-blue-800 border-blue-200",
  },
  completed: {
    label: "Concluído",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  delayed: {
    label: "Atrasado",
    className: "bg-red-50 text-red-800 border-red-200",
  },
};

const operationStatusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pendente",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  in_progress: {
    label: "Em curso",
    className: "bg-blue-50 text-blue-800 border-blue-200",
  },
  completed: {
    label: "Concluída",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  skipped: {
    label: "Ignorada",
    className: "bg-slate-200 text-slate-600 border-slate-300",
  },
};

const orderStatusConfig: Record<string, { label: string; className: string }> = {
  imported: {
    label: "Importado",
    className: "bg-slate-100 text-slate-800 border-slate-200",
  },
  planning: {
    label: "Planeamento",
    className: "bg-amber-50 text-amber-900 border-amber-200",
  },
  in_production: {
    label: "Em produção",
    className: "bg-blue-50 text-blue-800 border-blue-200",
  },
  ready: {
    label: "Pronto",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  finished: {
    label: "Finalizado",
    className: "bg-emerald-100 text-emerald-950 border-emerald-300",
  },
  delayed: {
    label: "Atrasado",
    className: "bg-red-50 text-red-800 border-red-200",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-slate-200 text-slate-800 border-slate-300",
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.slice(0, 10)), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

function dayOnly(iso: string) {
  return startOfDay(parseISO(iso.slice(0, 10)));
}

function isOrderDeliveryOverdue(order: ProductionOrder): boolean {
  if (!order.delivery_deadline) return false;
  if (order.status === "finished" || order.status === "cancelled") return false;
  try {
    const due = dayOnly(order.delivery_deadline);
    const today = startOfDay(new Date());
    return due < today;
  } catch {
    return false;
  }
}

type BarLayout = {
  leftPct: number;
  widthPct: number;
  visible: boolean;
  clipped: boolean;
};

function barLayoutForItem(
  item: OrderItem,
  gridStart: Date,
  numCols: number
): BarLayout | null {
  if (!item.production_start || !item.production_end) return null;
  try {
    const barStart = dayOnly(item.production_start);
    const barEnd = dayOnly(item.production_end);
    if (barEnd < barStart) return null;

    const startOff = differenceInDays(barStart, gridStart);
    const endExclusive = differenceInDays(barEnd, gridStart) + 1;

    const clipped =
      startOff < 0 || endExclusive > numCols || numCols <= 0;
    const visStart = Math.max(0, Math.min(startOff, numCols));
    const visEnd = Math.max(visStart, Math.min(endExclusive, numCols));
    const dur = visEnd - visStart;
    if (dur <= 0 && endExclusive > 0 && startOff < numCols) {
      return {
        leftPct:
          (Math.max(0, Math.min(startOff, numCols - 1)) / numCols) * 100,
        widthPct: (1 / numCols) * 100,
        visible: true,
        clipped,
      };
    }
    if (dur <= 0) {
      return { leftPct: 0, widthPct: 0, visible: false, clipped: true };
    }

    return {
      leftPct: (visStart / numCols) * 100,
      widthPct: (dur / numCols) * 100,
      visible: true,
      clipped,
    };
  } catch {
    return null;
  }
}

function GanttBarLabel({ widthPct, numCols }: { widthPct: number; numCols: number }) {
  const dayCount = Math.max(1, Math.round((widthPct / 100) * numCols));
  if (dayCount < 4 && widthPct < 12) return null;
  return <span className="truncate px-0.5">{dayCount}d</span>;
}

function GanttChart({ items }: { items: OrderItem[] }) {
  const scheduledItems = items.filter(
    (i) => i.production_start && i.production_end
  );

  if (scheduledItems.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-500">
        Nenhum item com datas de produção definidas para mostrar no cronograma.
      </div>
    );
  }

  let minD: Date | null = null;
  let maxD: Date | null = null;
  for (const i of scheduledItems) {
    const s = dayOnly(i.production_start!);
    const e = dayOnly(i.production_end!);
    if (!minD || s < minD) minD = s;
    if (!maxD || e > maxD) maxD = e;
  }
  if (!minD || !maxD) return null;

  const gridStart = minD;
  const naturalSpan = Math.max(1, differenceInDays(maxD, gridStart) + 1);
  const capped = naturalSpan > GANTT_MAX_COLS;
  const numCols = capped ? GANTT_MAX_COLS : naturalSpan;

  const days = Array.from({ length: numCols }, (_, i) => addDays(gridStart, i));
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");

  return (
    <div className="space-y-3">
      {capped ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          O intervalo ultrapassa {GANTT_MAX_COLS} dias: a grelha mostra desde{" "}
          {format(gridStart, "dd/MM/yyyy", { locale: ptBR })} até{" "}
          {format(days[days.length - 1]!, "dd/MM/yyyy", { locale: ptBR })}. As
          barras podem estar recortadas.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="min-w-[720px]">
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div className="w-52 shrink-0 p-2 text-xs font-semibold text-slate-600 uppercase tracking-wide sticky left-0 bg-slate-50 z-[1] border-r border-slate-100">
              Item
            </div>
            <div className="flex flex-1 min-w-0">
              {days.map((day, idx) => {
                const wk = isWeekend(day);
                const isToday = format(day, "yyyy-MM-dd") === todayStr;
                return (
                  <div
                    key={idx}
                    title={format(day, "EEEE dd/MM", { locale: ptBR })}
                    className={cn(
                      "flex-1 min-w-[24px] text-center text-[10px] leading-tight py-1 px-0.5 border-l border-slate-100 text-slate-600",
                      wk && "bg-slate-100/80 text-slate-400",
                      isToday &&
                        "bg-brand-50 text-brand-800 font-semibold ring-1 ring-brand-200 z-[1]"
                    )}
                  >
                    {format(day, "dd/MM", { locale: ptBR })}
                  </div>
                );
              })}
            </div>
          </div>

          {scheduledItems.map((item) => {
            const layout = barLayoutForItem(item, gridStart, numCols);
            const barColor =
              item.status === "completed"
                ? "bg-emerald-500"
                : item.status === "delayed"
                  ? "bg-red-500"
                  : "bg-blue-500";

            return (
              <div
                key={item.id}
                className="flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
              >
                <div className="w-52 shrink-0 p-2 border-r border-slate-100 text-sm sticky left-0 bg-white z-[1]">
                  <div
                    className="font-medium text-slate-900 truncate"
                    title={item.description}
                  >
                    {item.description}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {item.quantity} {item.unit ?? "UN"}
                  </div>
                </div>
                <div className="flex-1 relative min-h-[40px]">
                  {layout?.visible ? (
                    <div
                      className={cn(
                        "absolute top-2 h-6 rounded shadow-sm flex items-center justify-center text-[10px] text-white font-medium px-1 overflow-hidden",
                        barColor
                      )}
                      style={{
                        left: `${layout.leftPct}%`,
                        width: `${Math.max(layout.widthPct, 100 / numCols)}%`,
                      }}
                      title={
                        layout.clipped
                          ? "Barra parcial (fora da janela visível)"
                          : undefined
                      }
                    >
                      <GanttBarLabel
                        widthPct={layout.widthPct}
                        numCols={numCols}
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center px-2 text-[11px] text-slate-400">
                      Fora da janela
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ProductionOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderId =
    typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["production-order", orderId],
    queryFn: () => fetchOrder(orderId),
    enabled: Boolean(orderId),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      itemId,
      status,
    }: {
      itemId: string;
      status: string;
    }) => updateItemStatus(orderId, itemId, status),
    onSuccess: () => {
      toast.success("Estado do item atualizado.");
      void queryClient.invalidateQueries({
        queryKey: ["production-order", orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const operationMutation = useMutation({
    mutationFn: ({
      operationId,
      status,
    }: {
      operationId: string;
      status: string;
    }) => updateOperationStatus(operationId, status),
    onSuccess: () => {
      toast.success("Operação atualizada.");
      void queryClient.invalidateQueries({
        queryKey: ["production-order", orderId],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const [cancelOpOpen, setCancelOpOpen] = useState(false);
  const cancelOpMutation = useMutation({
    mutationFn: async (payload: {
      reason: ProductionCancellationReason;
      notes: string | null;
    }) => {
      const res = await fetch(
        `/api/production-orders/${orderId}/cancel`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao cancelar OP");
    },
    onSuccess: () => {
      toast.success("OP cancelada.");
      setCancelOpOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ["production-order", orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleStatusChange = (itemId: string, currentStatus: string) => {
    const newStatus =
      currentStatus === "completed" ? "scheduled" : "completed";
    updateMutation.mutate({ itemId, status: newStatus });
  };

  if (!orderId) {
    return (
      <AppPage title="Pedido de produção" backHref="/production/orders">
        <Card>
          <CardContent className="py-8 text-center text-red-600 text-sm">
            Identificador de pedido inválido.
          </CardContent>
        </Card>
      </AppPage>
    );
  }

  if (isLoading) {
    return (
      <AppPage title="Pedido de produção" backHref="/production/orders">
        <div className="flex justify-center items-center py-16 text-slate-500 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span className="text-sm">A carregar pedido…</span>
        </div>
      </AppPage>
    );
  }

  if (error || !order) {
    return (
      <AppPage title="Pedido de produção" backHref="/production/orders">
        <Card className="border-slate-200">
          <CardContent className="py-10">
            <p className="text-center text-red-600 text-sm">
              {(error as Error)?.message ?? "Pedido não encontrado."}
            </p>
            <div className="flex justify-center mt-6">
              <Link href="/production/orders">
                <Button type="button" variant="outline">
                  Voltar à lista
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </AppPage>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const orderBadge = orderStatusConfig[order.status] ?? {
    label: order.status,
    className: "bg-slate-100 text-slate-800 border-slate-200",
  };

  const completedCount = items.filter((i) => i.status === "completed").length;
  const progressPct =
    items.length > 0
      ? Math.round((completedCount / items.length) * 100)
      : 0;
  const deliveryOverdue = isOrderDeliveryOverdue(order);
  const canCancelOp =
    isAdmin &&
    !["cancelled", "finished", "completed"].includes(order.status);

  return (
    <AppPage
      title={
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono">{order.order_number}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
              orderBadge.className
            )}
          >
            {orderBadge.label}
          </span>
          {deliveryOverdue ? (
            <StatusBadge tone="danger" icon={AlertCircle}>
              Prazo de entrega ultrapassado
            </StatusBadge>
          ) : null}
        </div>
      }
      backHref="/production/orders"
      width="wide"
      density="comfortable"
      actions={
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => router.push(`/production/orders/${orderId}/edit`)}
          >
            <Edit className="h-4 w-4" aria-hidden />
            Editar
          </Button>
          {canCancelOp ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setCancelOpOpen(true)}
            >
              <Ban className="h-4 w-4" aria-hidden />
              Cancelar OP
            </Button>
          ) : null}
        </>
      }
    >
      {cancelOpOpen ? (
        <ProductionOrderCancelModal
          open={cancelOpOpen}
          orderNumber={order.order_number}
          busy={cancelOpMutation.isPending}
          onClose={() => setCancelOpOpen(false)}
          onSubmit={(payload) => cancelOpMutation.mutate(payload)}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 py-4">
            <CardTitle className="text-base">Dados do pedido</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            {order.client_name ? (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-900">{order.client_name}</span>
                  {order.client_document ? (
                    <span className="text-slate-500 ml-1">
                      ({order.client_document})
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {order.delivery_deadline ? (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <span
                  className={cn(deliveryOverdue && "text-red-700 font-medium")}
                >
                  Entrega: {formatDate(order.delivery_deadline)}
                </span>
              </div>
            ) : null}
            {order.pcp_deadline ? (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                <span>Prazo PCP: {formatDate(order.pcp_deadline)}</span>
              </div>
            ) : null}
            {order.production_deadline ? (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                <span>
                  Fim planeado (itens):{" "}
                  {formatDate(order.production_deadline)}
                </span>
              </div>
            ) : null}
            {order.description ? (
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-700 whitespace-pre-wrap">
                  {order.description}
                </p>
              </div>
            ) : null}
            {!order.client_name &&
            !order.delivery_deadline &&
            !order.pcp_deadline &&
            !order.production_deadline &&
            !order.description ? (
              <p className="text-slate-500">Sem dados adicionais.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 py-4">
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Total de itens</dt>
                <dd className="font-medium text-slate-900">{items.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Concluídos</dt>
                <dd className="font-semibold text-emerald-700">
                  {completedCount}
                </dd>
              </div>
              <div className="flex justify-between gap-4 items-center">
                <dt className="text-slate-500">Progresso</dt>
                <dd className="font-medium text-slate-900 tabular-nums">
                  {progressPct}%
                </dd>
              </div>
            </dl>
            <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4">
          <CardTitle className="text-base">Itens de produção</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {items.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">
              Nenhum item registado neste pedido.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="p-3 w-10">#</th>
                    <th className="p-3">Descrição</th>
                    <th className="p-3 text-center w-24">Qtd</th>
                    <th className="p-3">Linha</th>
                    <th className="p-3 whitespace-nowrap">Início</th>
                    <th className="p-3 whitespace-nowrap">Fim</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-center w-36">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const st = statusConfig[item.status] ?? {
                      label: item.status,
                      className:
                        "bg-slate-100 text-slate-800 border-slate-200",
                    };
                    const operations = Array.isArray(item.operations)
                      ? [...item.operations].sort(
                          (a, b) => a.sequence - b.sequence
                        )
                      : [];
                    return (
                      <Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono text-slate-700">
                          {item.item_number ?? "—"}
                        </td>
                        <td className="p-3">
                          <div className="text-slate-900">{item.description}</div>
                          {item.product ? (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {item.product.technical_code?.trim() ||
                                item.product.code?.trim() ||
                                "—"}{" "}
                              — {item.product.name}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3 text-center tabular-nums">
                          {item.quantity} {item.unit ?? "UN"}
                        </td>
                        <td className="p-3 text-slate-700">
                          {item.line?.name ?? "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {formatDate(item.production_start)}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {formatDate(item.production_end)}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                              st.className
                            )}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {item.status !== "completed" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={updateMutation.isPending}
                              onClick={() =>
                                handleStatusChange(item.id, item.status)
                              }
                            >
                              <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                              Concluir
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-slate-600"
                              disabled={updateMutation.isPending}
                              onClick={() =>
                                handleStatusChange(item.id, item.status)
                              }
                            >
                              Reabrir
                            </Button>
                          )}
                        </td>
                      </tr>
                      {operations.map((op) => {
                        const opSt = operationStatusConfig[op.status] ?? {
                          label: op.status,
                          className:
                            "bg-slate-100 text-slate-800 border-slate-200",
                        };
                        const nextStatus =
                          op.status === "completed"
                            ? "pending"
                            : op.status === "pending"
                              ? "in_progress"
                              : "completed";
                        const nextLabel =
                          op.status === "completed"
                            ? "Reabrir"
                            : op.status === "pending"
                              ? "Iniciar"
                              : "Concluir";
                        return (
                          <tr
                            key={op.id}
                            className="bg-slate-50/60 text-xs"
                          >
                            <td className="p-2 pl-6 text-slate-400">
                              {item.item_number ?? "—"}.{op.sequence}
                            </td>
                            <td className="p-2 text-slate-700" colSpan={2}>
                              Operação: {op.name}
                            </td>
                            <td className="p-2 text-slate-500" colSpan={3}>
                              {op.planned_duration_minutes
                                ? `${op.planned_duration_minutes} min`
                                : "—"}
                            </td>
                            <td className="p-2">
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                  opSt.className
                                )}
                              >
                                {opSt.label}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px]"
                                disabled={operationMutation.isPending}
                                onClick={() =>
                                  operationMutation.mutate({
                                    operationId: op.id,
                                    status: nextStatus,
                                  })
                                }
                              >
                                {nextLabel}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {items.length > 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 py-4">
            <CardTitle className="text-base">Cronograma (Gantt)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <GanttChart items={items} />
          </CardContent>
        </Card>
      ) : null}

      {order.notes ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 py-4">
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {order.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </AppPage>
  );
}
