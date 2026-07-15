/**
 * Permissão por campo: allowlist declarativa por entidade + módulo de negócio.
 */

export type FieldPermissionModule =
  | "expedicao"
  | "faturamento"
  | "compras"
  | "vendas";

export type FieldPermissionEntity =
  | "shipments"
  | "sales_order_items"
  | "purchase_order_items";

export type FieldAllowlistRegistry = {
  [E in FieldPermissionEntity]?: {
    [M in FieldPermissionModule]?: readonly string[];
  };
};

/** Campos fiscais de linha — só editáveis no módulo Faturamento. */
export const LINE_TAX_FIELDS = [
  "icms_rate",
  "icms_value",
  "ipi_rate",
  "ipi_value",
  "tax_base",
] as const;

export type LineTaxField = (typeof LINE_TAX_FIELDS)[number];
