/** Resultado mínimo de pesquisa de produto (catálogo / picker). */
export type ProductSearchHit = {
  id: string;
  technical_code: string | null;
  code: string | null;
  name: string;
  cost_price: number;
  unit: string | null;
  product_nature?: string | null;
  hvac_filter_class?: string | null;
  hvac_airflow_m3h?: number | null;
  hvac_cleanroom_class?: string | null;
  default_is_external_labor?: boolean | null;
  default_labor_cost?: number | null;
  default_work_center_id?: string | null;
  prefix?: { code?: string | null } | null;
};
