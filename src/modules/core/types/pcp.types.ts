import type { Database } from "./database";

/** Linha de produção (chão físico / vista Gantt) */
export type ProductionLine =
  Database["public"]["Tables"]["production_lines"]["Row"];
export type ProductionLineInsert =
  Database["public"]["Tables"]["production_lines"]["Insert"];
export type ProductionLineUpdate =
  Database["public"]["Tables"]["production_lines"]["Update"];

/** Pedido de produção (cabeçalho — equivalente a `orders` do legado) */
export type ProductionOrder =
  Database["public"]["Tables"]["production_orders"]["Row"];
export type ProductionOrderInsert =
  Database["public"]["Tables"]["production_orders"]["Insert"];
export type ProductionOrderUpdate =
  Database["public"]["Tables"]["production_orders"]["Update"];

/** Item de pedido — alocação em linha e datas no Gantt */
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderItemInsert =
  Database["public"]["Tables"]["order_items"]["Insert"];
export type OrderItemUpdate =
  Database["public"]["Tables"]["order_items"]["Update"];

export type Holiday = Database["public"]["Tables"]["holidays"]["Row"];
export type HolidayInsert = Database["public"]["Tables"]["holidays"]["Insert"];
export type HolidayUpdate = Database["public"]["Tables"]["holidays"]["Update"];

/** Operadores autorizados por linha */
export type OperatorLine =
  Database["public"]["Tables"]["operator_lines"]["Row"];
export type OperatorLineInsert =
  Database["public"]["Tables"]["operator_lines"]["Insert"];
export type OperatorLineUpdate =
  Database["public"]["Tables"]["operator_lines"]["Update"];

export type OrderStatus =
  | "imported"
  | "planning"
  | "in_production"
  | "ready"
  | "finished"
  | "delayed"
  | "cancelled";

export type OrderItemStatus = "waiting" | "scheduled" | "completed" | "delayed";

export interface OrderItemWithDetails extends OrderItem {
  product?: Database["public"]["Tables"]["products"]["Row"];
  line?: ProductionLine;
  completed_by_user?: Database["public"]["Tables"]["user_profiles"]["Row"];
}

export interface ProductionOrderWithItems extends ProductionOrder {
  items?: OrderItemWithDetails[];
}
