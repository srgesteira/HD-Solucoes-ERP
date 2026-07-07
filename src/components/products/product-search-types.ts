/** Resultado mínimo de pesquisa de produto (catálogo / picker). */
export type ProductSearchHit = {
  id: string;
  technical_code: string | null;
  code: string | null;
  name: string;
  description?: string | null;
  cost_price: number;
  unit: string | null;
  product_nature?: string | null;
  default_is_external_labor?: boolean | null;
  default_labor_cost?: number | null;
  default_work_center_id?: string | null;
  prefix?: { code?: string | null } | null;
};
