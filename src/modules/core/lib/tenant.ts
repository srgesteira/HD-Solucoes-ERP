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
export async function getCurrentTenantId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.tenant_id ?? null;
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
  if (await isCurrentUserTenantAdmin()) return true;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { loadProfileAccess } = await import("@/modules/core/lib/profile-access");
  const profile = await loadProfileAccess(user.id);
  const mods = normalizeEnabledModules(profile?.enabled_modules, profile?.role);
  if (mods.length > 0) {
    return userHasModule(
      { role: profile?.role, enabled_modules: mods },
      menuKey
    );
  }
  const perms = mergeModulePermissions(profile?.permissions);
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
