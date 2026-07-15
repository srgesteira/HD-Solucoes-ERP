import type { FieldAllowlistRegistry } from "./types";

/**
 * Allowlist por entidade + módulo.
 * Campos fora da lista são readonly na UI e rejeitados com 403 na API.
 *
 * Placeholders vazios para Faturamento/Compras — populados nas Fatias D/E.
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
} as const satisfies FieldAllowlistRegistry;
