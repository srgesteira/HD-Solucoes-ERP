import {
  MODULE_KEYS,
  type ModuleKey,
  type ModulePermissions,
} from "@/shared/auth/permissions";

/** Chaves de módulo do menu (decisão Item 12 — português). */
export const APP_MODULE_KEYS = [
  "core",
  "engenharia",
  "vendas",
  "faturamento",
  "compras",
  "pcp",
  "almoxarifado",
  "expedicao",
  "producao",
  "qualidade",
  "rh",
  "boards",
] as const;

export type AppMenuModuleKey = (typeof APP_MODULE_KEYS)[number];

export type UserModuleProfile = {
  role?: string | null;
  enabled_modules?: string[] | null;
};

export function normalizeEnabledModules(
  raw: string[] | null | undefined,
  role?: string | null
): string[] {
  if (role === "admin") return ["*"];
  if (!raw || raw.length === 0) return [];
  return raw.filter(Boolean);
}

function hasAnyModule(mods: string[], keys: string[]): boolean {
  return keys.some((k) => mods.includes(k));
}

const LEGACY_TO_MENU: Record<ModuleKey, AppMenuModuleKey[]> = {
  dashboard: ["core"],
  boards: ["boards"],
  logistics: ["expedicao", "pcp", "compras", "almoxarifado"],
  production: ["producao"],
  quality: ["qualidade"],
  engineering: ["engenharia"],
  purchasing: ["compras"],
  sales: ["vendas"],
  products: ["engenharia"],
  inventory: ["almoxarifado"],
  mrp: ["pcp"],
  settings: ["core"],
  reports: ["core", "faturamento"],
  finance: ["faturamento"],
  hr: ["rh"],
};

/** Quando enabled_modules está vazio, deriva do JSON legado permissions. */
export function legacyPermissionsToEnabledModules(
  perms: ModulePermissions
): string[] {
  const out = new Set<string>(["core"]);
  for (const [legacy, menuKeys] of Object.entries(LEGACY_TO_MENU) as [
    ModuleKey,
    AppMenuModuleKey[],
  ][]) {
    if (perms[legacy]) {
      for (const k of menuKeys) out.add(k);
    }
  }
  return [...out];
}

export function applyEnabledModulesToLegacyPermissions(
  perms: ModulePermissions,
  enabled_modules: string[] | null | undefined,
  role?: string | null
): ModulePermissions {
  const mods = normalizeEnabledModules(enabled_modules, role);
  if (mods.includes("*")) return perms;
  /** Com enabled_modules explícito, não herdar DEFAULT (boards/sales true). */
  if (mods.length === 0) return { ...perms };

  const out = {} as ModulePermissions;
  for (const k of MODULE_KEYS) {
    out[k] = false;
  }
  out.dashboard = true;

  if (hasAnyModule(mods, ["boards"])) out.boards = true;
  if (hasAnyModule(mods, ["vendas"])) out.sales = true;
  if (hasAnyModule(mods, ["faturamento"])) {
    out.finance = true;
    out.reports = true;
  }
  if (hasAnyModule(mods, ["compras"])) out.purchasing = true;
  if (hasAnyModule(mods, ["engenharia"])) {
    out.engineering = true;
    out.products = true;
  }
  if (hasAnyModule(mods, ["pcp"])) out.mrp = true;
  if (hasAnyModule(mods, ["almoxarifado"])) out.inventory = true;
  if (hasAnyModule(mods, ["producao"])) out.production = true;
  if (hasAnyModule(mods, ["qualidade"])) out.quality = true;
  if (hasAnyModule(mods, ["expedicao", "pcp", "almoxarifado"])) {
    out.logistics = true;
  }
  if (hasAnyModule(mods, ["rh"])) out.hr = true;
  if (hasAnyModule(mods, ["core"])) out.settings = true;
  return out;
}

export function userHasModule(
  user: UserModuleProfile,
  moduleKey: string
): boolean {
  const mods = normalizeEnabledModules(user.enabled_modules, user.role);
  if (mods.includes("*")) return true;
  return mods.includes(moduleKey);
}

export function userHasModuleOrLegacy(
  user: UserModuleProfile & { permissions?: ModulePermissions },
  menuModuleKey: string,
  legacyKey?: ModuleKey
): boolean {
  const mods = normalizeEnabledModules(user.enabled_modules, user.role);
  if (mods.length > 0) {
    return userHasModule(user, menuModuleKey);
  }
  if (legacyKey && user.permissions) {
    return user.permissions[legacyKey] === true;
  }
  return false;
}

export function unionRoleModuleKeys(
  rows: { module_keys?: string[] | null }[]
): string[] {
  if (rows.some((r) => r.module_keys?.includes("*"))) return ["*"];
  const set = new Set<string>();
  for (const r of rows) {
    for (const k of r.module_keys ?? []) {
      if (k) set.add(k);
    }
  }
  if (!set.has("core") && set.size > 0) set.add("core");
  return [...set];
}

export function isAppModuleKey(key: string): key is AppMenuModuleKey {
  return (APP_MODULE_KEYS as readonly string[]).includes(key);
}
