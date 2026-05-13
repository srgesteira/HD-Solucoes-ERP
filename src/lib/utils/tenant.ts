import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  mergeModulePermissions,
  type ModuleKey,
} from "@/lib/permissions";

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
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("permissions")
    .eq("id", user.id)
    .maybeSingle();
  const perms = mergeModulePermissions(profile?.permissions);
  return perms[module] === true;
}
