import type { Json } from "@/lib/types/database";

export type ModuleKey =
  | "dashboard"
  | "boards"
  | "logistics"
  | "production"
  | "quality"
  | "engineering"
  | "purchasing"
  | "sales"
  | "products"
  | "inventory"
  | "mrp"
  | "settings"
  | "reports"
  | "finance"
  | "hr";

export type ModulePermissions = Record<ModuleKey, boolean>;

export const MODULE_KEYS: ModuleKey[] = [
  "dashboard",
  "boards",
  "logistics",
  "production",
  "quality",
  "engineering",
  "purchasing",
  "sales",
  "products",
  "inventory",
  "mrp",
  "settings",
  "reports",
  "finance",
  "hr",
];

export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  dashboard: true,
  boards: true,
  logistics: false,
  production: true,
  quality: false,
  engineering: false,
  purchasing: true,
  sales: true,
  products: true,
  inventory: false,
  mrp: false,
  settings: true,
  reports: true,
  finance: false,
  hr: false,
};

function isModuleKey(k: string): k is ModuleKey {
  return (MODULE_KEYS as string[]).includes(k);
}

/** Interpreta JSON da coluna `user_profiles.permissions`. */
export function mergeModulePermissions(
  raw: Json | null | undefined
): ModulePermissions {
  const out = { ...DEFAULT_MODULE_PERMISSIONS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isModuleKey(k) && typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

export function fullAccessPermissions(): ModulePermissions {
  const all = {} as ModulePermissions;
  for (const k of MODULE_KEYS) {
    all[k] = true;
  }
  return all;
}

export function effectivePermissions(
  tenantRole: "admin" | "member" | undefined,
  raw: Json | null | undefined
): ModulePermissions {
  if (tenantRole === "admin") {
    return fullAccessPermissions();
  }
  return mergeModulePermissions(raw);
}
