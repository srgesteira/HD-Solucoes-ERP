import { FIELD_ALLOWLISTS } from "./registry";
import type {
  FieldPermissionEntity,
  FieldPermissionModule,
} from "./types";

export type {
  FieldAllowlistRegistry,
  FieldPermissionEntity,
  FieldPermissionModule,
} from "./types";
export { FIELD_ALLOWLISTS } from "./registry";

export function getEditableFields(
  entity: FieldPermissionEntity,
  module: FieldPermissionModule
): readonly string[] {
  const byEntity = FIELD_ALLOWLISTS[entity];
  if (!byEntity) return [];
  const list = (byEntity as Partial<Record<FieldPermissionModule, readonly string[]>>)[
    module
  ];
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
