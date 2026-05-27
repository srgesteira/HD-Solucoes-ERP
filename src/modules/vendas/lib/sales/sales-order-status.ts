import {
  SALES_ORDER_STATUSES,
  type SalesOrderStatus,
} from "@/modules/core/types/sales.types";

export const SALES_ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  in_production: "Em produção",
  shipped: "Expedido",
  delivered: "Entregue",
  cancelled: "Cancelado",
  superseded: "Substituído",
};

/** Estados editáveis no formulário (exclui substituído). */
export const SALES_ORDER_EDITABLE_STATUSES = SALES_ORDER_STATUSES.filter(
  (s) => s !== "superseded"
) as Exclude<SalesOrderStatus, "superseded">[];
