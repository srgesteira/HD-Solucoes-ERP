import type { Database } from "./database";

// Suppliers
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type SupplierInsert =
  Database["public"]["Tables"]["suppliers"]["Insert"];
export type SupplierUpdate =
  Database["public"]["Tables"]["suppliers"]["Update"];

// Purchase Orders
export type PurchaseOrder =
  Database["public"]["Tables"]["purchase_orders"]["Row"];
export type PurchaseOrderInsert =
  Database["public"]["Tables"]["purchase_orders"]["Insert"];
export type PurchaseOrderUpdate =
  Database["public"]["Tables"]["purchase_orders"]["Update"];

// Purchase Order Items
export type PurchaseOrderItem =
  Database["public"]["Tables"]["purchase_order_items"]["Row"];
export type PurchaseOrderItemInsert =
  Database["public"]["Tables"]["purchase_order_items"]["Insert"];

// Goods Receipts
export type GoodsReceipt =
  Database["public"]["Tables"]["goods_receipts"]["Row"];

// Status types
export type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial"
  | "received"
  | "cancelled";

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier?: Supplier;
  items?: PurchaseOrderItemWithDetails[];
  requested_by_user?: Database["public"]["Tables"]["user_profiles"]["Row"];
  approved_by_user?: Database["public"]["Tables"]["user_profiles"]["Row"];
}

export interface PurchaseOrderItemWithDetails extends PurchaseOrderItem {
  product?: Database["public"]["Tables"]["products"]["Row"];
  production_order?: Database["public"]["Tables"]["production_orders"]["Row"];
}
