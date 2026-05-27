/**
 * Regras de conclusão real vs. programação (production_end futuro ≠ concluído).
 */

export type OrderItemProductionFields = {
  production_start: string | null;
  production_end: string | null;
  status?: string | null;
  completed_at?: string | null;
};

export function dateOnlyYmd(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Item concluído de facto (apontamento), não apenas com data de fim programada no futuro. */
export function isOrderItemProductionFinished(
  item: OrderItemProductionFields
): boolean {
  if (item.status === "completed") return true;
  if (item.completed_at) return true;
  const end = dateOnlyYmd(item.production_end);
  if (!end) return false;
  return end <= todayYmdLocal();
}

export type OrderProductionAggregateStatus =
  | "not_processed"
  | "scheduled"
  | "in_production"
  | "finished";

/**
 * Estado agregado do pedido (PCP + vendas).
 * - not_processed: sem order_items ligados
 * - finished: todos os itens concluídos de facto
 * - in_production: algum com início e ainda não concluído
 * - scheduled: restante (inclui só datas programadas no futuro)
 */
export function computeOrderProductionAggregateStatus(
  items: OrderItemProductionFields[]
): OrderProductionAggregateStatus {
  if (items.length === 0) return "not_processed";

  if (items.every(isOrderItemProductionFinished)) return "finished";

  const anyActive = items.some(
    (it) =>
      !isOrderItemProductionFinished(it) &&
      (Boolean(it.production_start) || Boolean(it.production_end))
  );
  if (anyActive) return "in_production";

  const anyStarted = items.some((it) => Boolean(it.production_start));
  if (anyStarted) return "in_production";

  return "scheduled";
}

export const ORDER_PRODUCTION_STATUS_LABELS: Record<
  OrderProductionAggregateStatus,
  string
> = {
  not_processed: "Não processado",
  scheduled: "Programado",
  in_production: "Em produção",
  finished: "Finalizado",
};

/** Situação curta na listagem de vendas. */
export type SalesProductionSituation =
  | "none"
  | "scheduled"
  | "producing"
  | "ready";

export function toSalesProductionSituation(
  status: OrderProductionAggregateStatus
): SalesProductionSituation {
  switch (status) {
    case "not_processed":
      return "none";
    case "scheduled":
      return "scheduled";
    case "in_production":
      return "producing";
    case "finished":
      return "ready";
    default:
      return "none";
  }
}
