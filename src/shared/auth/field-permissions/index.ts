import { FIELD_ALLOWLISTS } from "./registry";
import {
  LINE_TAX_FIELDS,
  type FieldPermissionEntity,
  type FieldPermissionModule,
  type LineTaxField,
} from "./types";

export type {
  FieldAllowlistRegistry,
  FieldPermissionEntity,
  FieldPermissionModule,
  LineTaxField,
} from "./types";
export { LINE_TAX_FIELDS } from "./types";
export { FIELD_ALLOWLISTS } from "./registry";

export function getEditableFields(
  entity: FieldPermissionEntity,
  module: FieldPermissionModule
): readonly string[] {
  const byEntity = FIELD_ALLOWLISTS[entity];
  if (!byEntity) return [];
  const list = (
    byEntity as Partial<Record<FieldPermissionModule, readonly string[]>>
  )[module];
  return list ?? [];
}

export function canEditField(
  entity: FieldPermissionEntity,
  module: FieldPermissionModule,
  field: string
): boolean {
  return getEditableFields(entity, module).includes(field);
}

/** UI: campo fora da alçada → readonly. */
export function isFieldReadonly(
  entity: FieldPermissionEntity,
  module: FieldPermissionModule,
  field: string
): boolean {
  return !canEditField(entity, module, field);
}

export function canEditLineTaxes(
  entity: "sales_order_items" | "purchase_order_items",
  module: FieldPermissionModule
): boolean {
  return canEditField(entity, module, "icms_rate");
}

export type FieldPermissionCheck =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; forbidden: string[] };

/**
 * API: só campos da allowlist entram no patch.
 * Qualquer outro campo presente no payload → rejeição (403).
 */
export function filterAllowedPatch(
  entity: FieldPermissionEntity,
  module: FieldPermissionModule,
  body: Record<string, unknown>
): FieldPermissionCheck {
  const allowed = new Set(getEditableFields(entity, module));
  const keys = Object.keys(body);
  const forbidden = keys.filter((k) => !allowed.has(k));
  if (forbidden.length > 0) {
    return { ok: false, forbidden };
  }
  const patch: Record<string, unknown> = {};
  for (const k of keys) {
    if (allowed.has(k)) patch[k] = body[k];
  }
  return { ok: true, patch };
}

export type LineTaxSnapshot = {
  id?: string | null;
  icms_rate?: number | null;
  icms_value?: number | null;
  ipi_rate?: number | null;
  ipi_value?: number | null;
  tax_base?: number | null;
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function taxFieldValue(line: LineTaxSnapshot, field: LineTaxField): number {
  const v = line[field];
  return round2(typeof v === "number" ? v : Number(v ?? 0));
}

/**
 * Se o módulo não pode editar impostos, rejeita (403) alteração das alíquotas.
 * Valores (ICMS/IPI R$ / base) podem recalcular com qtd/preço; o que trava é a %.
 * Linhas novas: alíquotas têm de ser 0 (Faturamento define depois).
 */
export function assertLineTaxesUnchangedOutsideFaturamento(
  entity: "sales_order_items" | "purchase_order_items",
  module: FieldPermissionModule,
  incoming: LineTaxSnapshot[],
  existingById: Map<string, LineTaxSnapshot>
): { ok: true } | { ok: false; message: string; status: 403 } {
  if (canEditLineTaxes(entity, module)) {
    return { ok: true };
  }

  const rateFields = ["icms_rate", "ipi_rate"] as const;

  for (let i = 0; i < incoming.length; i++) {
    const line = incoming[i]!;
    const id = line.id?.trim() || "";
    const existing = id ? existingById.get(id) : undefined;

    for (const field of rateFields) {
      const next = taxFieldValue(line, field);
      if (!existing) {
        if (next !== 0) {
          return {
            ok: false,
            status: 403,
            message: `Alíquotas fiscais fora da alçada (${field}). Só editáveis no Faturamento.`,
          };
        }
        continue;
      }
      const prev = taxFieldValue(existing, field);
      if (next !== prev) {
        return {
          ok: false,
          status: 403,
          message: `Alíquotas fiscais fora da alçada (${field}). Só editáveis no Faturamento.`,
        };
      }
    }
  }

  return { ok: true };
}
