/**
 * Permissão por campo: allowlist declarativa por entidade + módulo de negócio.
 * Extensível — nesta fatia só Expedição (shipments) está populada.
 */

export type FieldPermissionModule =
  | "expedicao"
  | "faturamento"
  | "compras";

export type FieldPermissionEntity = "shipments";

export type FieldAllowlistRegistry = {
  [E in FieldPermissionEntity]?: {
    [M in FieldPermissionModule]?: readonly string[];
  };
};
