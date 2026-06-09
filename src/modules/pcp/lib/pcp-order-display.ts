import type { PcpPlanningItem, PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";
import { computeOrderProductionDeadline } from "@/modules/pcp/lib/pcp-planning";
import {
  computeOrderProductionAggregateStatus,
  isOrderItemProductionFinished,
  isOrderItemProductionOverdue,
  ORDER_PRODUCTION_STATUS_LABELS,
  type OrderItemProductionFields,
  type OrderProductionAggregateStatus,
} from "@/modules/pcp/lib/order-item-production-status";

export type OrderDeadlineTrafficLight = "white" | "red" | "yellow" | "green";

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).slice(0, 10);
  return s.length >= 10 ? s : null;
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

function isPastDeadline(d: string): boolean {
  return d < todayYmd();
}

/** Farol do Prazo PCP (célula/campo editável). */
export function pcpDeadlineProximityClass(deadline: string | null): string {
  if (!deadline) return "text-slate-500";
  const t = todayYmd();
  if (deadline < t) return "text-red-800 font-semibold";
  if (deadline === t) return "text-emerald-800 font-medium";
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const soon = d.toISOString().slice(0, 10);
  if (deadline <= soon) return "text-amber-800 font-medium";
  return "text-emerald-800";
}

/** Prazo produção calculado — somente leitura (vermelho se atrasado). */
export function productionDeadlineDisplayClass(
  deadline: string | null,
  items?: OrderItemProductionFields[]
): string {
  if (!deadline) return "text-slate-500";
  if (items?.some(isOrderItemProductionOverdue)) {
    return "text-red-800 font-semibold";
  }
  return "text-blue-800 font-medium";
}

/** Farol do Prazo Vendas (mesma regra de proximidade do PCP). */
export function salesDeadlineProximityClass(
  deadline: string | null
): string {
  return pcpDeadlineProximityClass(deadline);
}

/** @deprecated use salesDeadlineProximityClass */
export function salesDeadlineDisplayClass(
  deadline?: string | null
): string {
  return deadline
    ? salesDeadlineProximityClass(deadline)
    : "text-slate-500";
}

export function maxItemProductionEnd(
  items: Pick<PcpPlanningItem, "production_end">[]
): string | null {
  let best: string | null = null;
  for (const it of items) {
    const d = dateOnly(it.production_end);
    if (!d) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/** Maior `production_end` entre os itens (sem fallback armazenado no pedido). */
export function effectiveOrderProductionDeadline(
  order: PcpPlanningOrder
): string | null {
  return computeOrderProductionDeadline(order.items, null);
}

export function areAllOrderDeadlinesSameDay(order: PcpPlanningOrder): boolean {
  const v = dateOnly(order.expected_delivery ?? order.delivery_deadline);
  const p = dateOnly(order.pcp_deadline);
  const pr = effectiveOrderProductionDeadline(order);
  return !!(v && p && pr && v === p && p === pr);
}

/** Farol na linha do pedido (PCP Control — compara Vendas × PCP × Produção). */
export function getOrderDeadlineTrafficLight(
  order: PcpPlanningOrder
): OrderDeadlineTrafficLight {
  const v = dateOnly(order.expected_delivery ?? order.delivery_deadline);
  const p = dateOnly(order.pcp_deadline);
  const pr = effectiveOrderProductionDeadline(order);
  if (!v || !p || !pr) return "white";
  if (v === p && p === pr) return "yellow";
  if (p > v) return "red";
  if (pr > v) return "red";
  if (p < v && pr > p && pr <= v) return "yellow";
  if (p < v && pr <= p) return "green";
  return "white";
}

export function trafficRowClass(
  traffic: OrderDeadlineTrafficLight
): string {
  switch (traffic) {
    case "red":
      return "bg-red-50";
    case "yellow":
      return "bg-amber-50";
    case "green":
      return "bg-emerald-50";
    default:
      return "bg-white";
  }
}

/** Prazo PCP efetivo na linha de produção (item → pedido → vendas). */
export function effectiveLinePcpDeadline(
  item: Pick<PcpPlanningItem, "pcp_deadline" | "item_pcp_deadline">,
  orderPcp: string | null,
  orderDelivery: string | null
): string | null {
  return (
    dateOnly(item.item_pcp_deadline) ??
    dateOnly(item.pcp_deadline) ??
    dateOnly(orderPcp) ??
    dateOnly(orderDelivery)
  );
}

/**
 * Farol na aba Linhas — coluna Fim Real vs Prazo PCP.
 */
export function lineEndVsPcpTrafficClass(
  pcpDeadline: string | null,
  productionEnd: string | null,
  completed: boolean
): string {
  const pcp = dateOnly(pcpDeadline);
  const end = dateOnly(productionEnd);
  if (!pcp) return "text-slate-500";

  if (end && completed) {
    if (end > pcp) return "text-red-800 font-semibold";
    return "text-emerald-800 font-medium";
  }

  const t = todayYmd();
  if (end && end < t) return "text-red-800 font-semibold";
  if (pcp < t) return "text-red-800 font-semibold";
  if (pcp === t) return "text-amber-800 font-medium";
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const soon = d.toISOString().slice(0, 10);
  if (pcp <= soon) return "text-amber-800 font-medium";
  return "text-slate-600";
}

export function lineRowDelayClass(
  pcpDeadline: string | null,
  productionEnd: string | null,
  completed: boolean
): string {
  const pcp = dateOnly(pcpDeadline);
  const end = dateOnly(productionEnd);
  if (completed) return "";
  if (end && pcp && end > pcp) return "bg-red-50";
  if (end && isPastDeadline(end)) return "bg-red-50";
  return "";
}

export type PcpPrincipalStatus =
  | "atrasado"
  | "vai_atrasar"
  | "falta_linha"
  | "aguardando_programacao"
  | "programado"
  | "produzindo"
  | "pronta"
  | "finalizado"
  | null;

function itemProductionFields(it: PcpPlanningItem): OrderItemProductionFields {
  return {
    production_start: it.production_start,
    production_end: it.production_end,
    status: it.production_status,
    completed_at: it.production_completed_at,
    apontamento_start_at: it.apontamento_start_at,
    apontamento_end_at: it.apontamento_end_at,
  };
}

function itemCompleted(it: PcpPlanningItem): boolean {
  return isOrderItemProductionFinished(itemProductionFields(it));
}

/** Pedido fechado pelo PCP (vendas: lib. faturamento; estoque: OP finalizada). */
export function isOrderPcpClosed(order: PcpPlanningOrder): boolean {
  if (order.order_source === "stock") {
    return order.status === "finished";
  }
  return order.ready_for_invoice === true;
}

export function isOrderProductionReady(order: PcpPlanningOrder): boolean {
  return getOrderProductionAggregateStatus(order) === "finished";
}

/** Estado agregado do pedido para PCP e vendas (conclusão real vs. programado). */
export function getOrderProductionAggregateStatus(
  order: PcpPlanningOrder
): OrderProductionAggregateStatus {
  return computeOrderProductionAggregateStatus(
    order.items.map((it) => itemProductionFields(it))
  );
}

export function orderProductionStatusLabel(
  order: PcpPlanningOrder
): string {
  return ORDER_PRODUCTION_STATUS_LABELS[getOrderProductionAggregateStatus(order)];
}

/** Alinhado a `getOrderPrincipalStatus` do PCP Control legado. */
export function getOrderPrincipalStatus(
  order: PcpPlanningOrder
): PcpPrincipalStatus {
  const items = order.items;
  if (items.length === 0) return null;

  const hasDelayed = items.some((it) =>
    isOrderItemProductionOverdue(itemProductionFields(it))
  );
  if (hasDelayed) return "atrasado";

  const pcpDeadline = dateOnly(order.pcp_deadline);
  const hasWillDelay = items.some(
    (it) =>
      !itemCompleted(it) &&
      it.production_end &&
      pcpDeadline &&
      dateOnly(it.production_end)! > pcpDeadline
  );
  if (hasWillDelay) return "vai_atrasar";

  if (items.some((it) => !it.line_id)) return "falta_linha";

  if (isOrderPcpClosed(order)) {
    return "finalizado";
  }

  if (isOrderProductionReady(order)) {
    return "pronta";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let hasScheduled = false;
  let hasProducing = false;
  let hasAwaiting = false;

  for (const it of items) {
    if (itemCompleted(it)) continue;
    if (!it.production_start) {
      hasAwaiting = true;
      continue;
    }
    const startStr = dateOnly(it.production_start);
    if (!startStr) {
      hasAwaiting = true;
      continue;
    }
    const start = new Date(`${startStr}T12:00:00`);
    const endStr = dateOnly(it.production_end);
    const end = endStr ? new Date(`${endStr}T12:00:00`) : null;

    if (today < start) hasScheduled = true;
    else if (!end || today <= end) hasProducing = true;
  }

  if (hasAwaiting) return "aguardando_programacao";
  if (hasScheduled) return "programado";
  if (hasProducing) return "produzindo";

  return "aguardando_programacao";
}

/** @deprecated use pcpDeadlineProximityClass */
export function deadlineProximityClass(deadline: string | null): string {
  return pcpDeadlineProximityClass(deadline);
}

/** @deprecated use pcpDeadlineProximityClass */
export function pcpDeadlineCellClass(deadline: string | null): string {
  return pcpDeadlineProximityClass(deadline);
}

export function formatPcpDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function itemProductionEndDate(
  item: PcpPlanningItem
): string | null {
  return dateOnly(item.production_end);
}
