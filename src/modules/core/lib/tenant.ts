import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import {
  mergeModulePermissions,
  type ModuleKey,
} from "@/shared/auth/permissions";
import {
  normalizeEnabledModules,
  userHasModule,
  legacyPermissionsToEnabledModules,
} from "@/shared/auth/menu-modules";

/**
 * Tenant do utilizador autenticado (via perfil na BD).
 * Usado pelas APIs com cliente admin + filtro `tenant_id`.
 */
export async function getTenantIdForUserId(
  userId: string
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  return profile?.tenant_id ?? null;
}

export async function getCurrentTenantId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return getTenantIdForUserId(user.id);
}

const MENU_MODULE_KEYS = [
  "compras",
  "engenharia",
  "faturamento",
  "vendas",
  "pcp",
  "almoxarifado",
  "expedicao",
  "producao",
  "qualidade",
  "rh",
  "boards",
  "core",
] as const;

function canMenuModuleFromProfile(
  profile: {
    role: string | null;
    permissions: import("@/modules/core/types/database").Json | null;
    enabled_modules: string[] | null;
  },
  menuKey: string
): boolean {
  if (profile.role === "admin") return true;
  const mods = normalizeEnabledModules(profile.enabled_modules, profile.role);
  if (mods.length > 0) {
    return userHasModule({ role: profile.role, enabled_modules: mods }, menuKey);
  }
  const perms = mergeModulePermissions(profile.permissions);
  const legacyMap: Record<string, ModuleKey> = {
    vendas: "sales",
    compras: "purchasing",
    faturamento: "finance",
    engenharia: "engineering",
    pcp: "mrp",
    almoxarifado: "inventory",
    expedicao: "logistics",
    producao: "production",
    qualidade: "quality",
    rh: "hr",
    boards: "boards",
    core: "settings",
  };
  const legacy = legacyMap[menuKey];
  return legacy ? perms[legacy] === true : false;
}

/** Uma leitura de perfil para derivar acesso a vários módulos do menu. */
export async function loadCurrentUserMenuAccess(): Promise<{
  tenantId: string | null;
  menuModules: Record<string, boolean>;
} | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { loadProfileAccess } = await import("@/modules/core/lib/profile-access");
  const profile = await loadProfileAccess(user.id);
  if (!profile) {
    return { tenantId: null, menuModules: {} };
  }

  const menuModules: Record<string, boolean> = {};
  for (const key of MENU_MODULE_KEYS) {
    menuModules[key] = canMenuModuleFromProfile(profile, key);
  }

  return {
    tenantId: profile.tenant_id ?? null,
    menuModules,
  };
}

export async function isCurrentUserTenantAdmin(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "admin";
}

/** Permissão de módulo para membros; administradores têm sempre acesso. */
export async function currentUserCanModule(
  module: ModuleKey
): Promise<boolean> {
  if (await isCurrentUserTenantAdmin()) return true;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { loadProfileAccess } = await import("@/modules/core/lib/profile-access");
  const profile = await loadProfileAccess(user.id);
  const perms = mergeModulePermissions(profile?.permissions);
  const mods = normalizeEnabledModules(profile?.enabled_modules, profile?.role);
  if (mods.length > 0) {
    const { applyEnabledModulesToLegacyPermissions } = await import(
      "@/shared/auth/menu-modules"
    );
    const bridged = applyEnabledModulesToLegacyPermissions(
      perms,
      mods,
      profile?.role
    );
    return bridged[module] === true;
  }
  return perms[module] === true;
}

/** Acesso por chave PT do menu (enabled_modules). */
export async function currentUserCanMenuModule(
  menuKey: string
): Promise<boolean> {
  const access = await loadCurrentUserMenuAccess();
  if (!access) return false;
  return access.menuModules[menuKey] === true;
}
