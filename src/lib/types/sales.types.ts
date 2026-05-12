import type { Database } from "@/lib/types/database";

export type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
export type QuoteInsert = Database["public"]["Tables"]["quotes"]["Insert"];
export type QuoteUpdate = Database["public"]["Tables"]["quotes"]["Update"];

export type QuoteItemRow = Database["public"]["Tables"]["quote_items"]["Row"];

export type SalesOrderRow = Database["public"]["Tables"]["sales_orders"]["Row"];
export type SalesOrderInsert =
  Database["public"]["Tables"]["sales_orders"]["Insert"];
export type SalesOrderUpdate =
  Database["public"]["Tables"]["sales_orders"]["Update"];

export type SalesOrderItemRow =
  Database["public"]["Tables"]["sales_order_items"]["Row"];

export type SalesGoalRow = Database["public"]["Tables"]["sales_goals"]["Row"];
export type SalesGoalInsert =
  Database["public"]["Tables"]["sales_goals"]["Insert"];
export type SalesGoalUpdate =
  Database["public"]["Tables"]["sales_goals"]["Update"];

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "converted",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const SALES_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];
