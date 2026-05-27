import type { Json } from "@/modules/core/types/database";
import { mergeModulePermissions } from "@/shared/auth/permissions";
import {
  legacyPermissionsToEnabledModules,
  normalizeEnabledModules,
  userHasModule,
} from "@/shared/auth/menu-modules";

/** Perfil mínimo para validação de módulo no middleware. */
export type MiddlewareAccessProfile = {
  role: string | null;
  enabled_modules: string[] | null;
  permissions: Json | null;
};

/** Prefixo de rota → chave PT em `enabled_modules` (ordem: prefixos mais longos primeiro). */
const ROUTE_MENU_MODULE_RULES: { prefix: string; moduleKey: string }[] = [
  { prefix: "/dashboard-gerencial", moduleKey: "faturamento" },
  { prefix: "/logistics/pcp", moduleKey: "pcp" },
  { prefix: "/logistics/warehouse", moduleKey: "almoxarifado" },
  { prefix: "/logistics/shipping", moduleKey: "expedicao" },
  { prefix: "/logistics/reports", moduleKey: "expedicao" },
  { prefix: "/sales", moduleKey: "vendas" },
  { prefix: "/purchasing", moduleKey: "compras" },
  { prefix: "/finance", moduleKey: "faturamento" },
  { prefix: "/production", moduleKey: "producao" },
  { prefix: "/inventory", moduleKey: "almoxarifado" },
  { prefix: "/shipping", moduleKey: "expedicao" },
  { prefix: "/products", moduleKey: "engenharia" },
  { prefix: "/engineering", moduleKey: "engenharia" },
  { prefix: "/customers", moduleKey: "vendas" },
  { prefix: "/quality", moduleKey: "qualidade" },
  { prefix: "/boards", moduleKey: "boards" },
  { prefix: "/settings", moduleKey: "core" },
  { prefix: "/reports", moduleKey: "faturamento" },
  { prefix: "/dashboard", moduleKey: "faturamento" },
  { prefix: "/hr", moduleKey: "rh" },
  { prefix: "/mrp", moduleKey: "pcp" },
  { prefix: "/pcp", moduleKey: "pcp" },
].sort((a, b) => b.prefix.length - a.prefix.length);

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Módulo PT exigido para o pathname, ou `null` se a rota não é restrita por módulo. */
export function requiredMenuModuleForPath(pathname: string): string | null {
  for (const rule of ROUTE_MENU_MODULE_RULES) {
    if (pathMatchesPrefix(pathname, rule.prefix)) {
      return rule.moduleKey;
    }
  }
  return null;
}

export function profileCanAccessMenuModule(
  profile: MiddlewareAccessProfile,
  menuKey: string
): boolean {
  if (profile.role === "admin") return true;

  const mods = normalizeEnabledModules(profile.enabled_modules, profile.role);
  if (mods.includes("*")) return true;
  if (mods.length > 0) {
    return userHasModule(
      { role: profile.role, enabled_modules: mods },
      menuKey
    );
  }

  const perms = mergeModulePermissions(profile.permissions);
  const derived = legacyPermissionsToEnabledModules(perms);
  return derived.includes(menuKey);
}

/** Rótulos para toast / query `?denied=`. */
export const MENU_MODULE_LABELS: Record<string, string> = {
  core: "Core",
  engenharia: "Engenharia",
  vendas: "Vendas",
  faturamento: "Faturamento",
  compras: "Compras",
  pcp: "PCP",
  almoxarifado: "Almoxarifado",
  expedicao: "Expedição",
  producao: "Produção",
  qualidade: "Qualidade",
  rh: "RH",
  boards: "Tarefas",
};
