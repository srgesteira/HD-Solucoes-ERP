import type { FieldAllowlistRegistry } from "./types";
import { LINE_TAX_FIELDS } from "./types";

/**
 * Allowlist por entidade + módulo.
 * Campos fora da lista são readonly na UI e rejeitados com 403 na API.
 *
 * Impostos de linha: só `faturamento` tem os campos fiscais na allowlist.
 * `vendas` / `compras` não listam impostos → readonly + 403 se alterarem.
 */
export const FIELD_ALLOWLISTS = {
  shipments: {
    expedicao: [
      "carrier_name",
      "carrier_document",
      "volumes_count",
      "packaging_description",
    ],
  },
  sales_order_items: {
    faturamento: [...LINE_TAX_FIELDS],
    vendas: [],
  },
  purchase_order_items: {
    faturamento: [...LINE_TAX_FIELDS],
    compras: [],
  },
} as const satisfies FieldAllowlistRegistry;
