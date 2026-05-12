import type { Database } from "./database";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

type ProductComponentRow = Database["public"]["Tables"]["product_components"]["Row"];
type ProductComponentInsert = Database["public"]["Tables"]["product_components"]["Insert"];
type ProductComponentUpdate = Database["public"]["Tables"]["product_components"]["Update"];

type WorkCenterRow = Database["public"]["Tables"]["work_centers"]["Row"];
type WorkCenterInsert = Database["public"]["Tables"]["work_centers"]["Insert"];
type WorkCenterUpdate = Database["public"]["Tables"]["work_centers"]["Update"];

export interface Product extends ProductRow {
  components?: ProductComponentWithDetails[];
  total_cost?: number;
}

export interface ProductComponentWithDetails extends ProductComponentRow {
  component_product?: ProductRow;
  work_center?: WorkCenterRow;
}

export interface ProductComponent extends ProductComponentRow {}
export interface WorkCenter extends WorkCenterRow {}

export type ProductType = "finished" | "raw" | "component";
export type ProductUnit = "PC" | "KG" | "M" | "H" | "L" | "CX" | "UN";

export interface ProductFilters {
  type?: ProductType | "all";
  is_active?: boolean;
  search?: string;
}
