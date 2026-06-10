import type { User } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";

/** Sincroniza user_metadata do convite → user_profiles (idempotente). */
export async function syncInviteProfileFromUser(user: User): Promise<void> {
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const tenant_id = typeof md.tenant_id === "string" ? md.tenant_id : null;
  const enabled_modules = Array.isArray(md.enabled_modules)
    ? (md.enabled_modules.filter((x) => typeof x === "string") as string[])
    : null;
  const admin_all = md.admin_all === true;
  const role_key = typeof md.role_key === "string" ? md.role_key : null;

  if (!tenant_id || (!enabled_modules && !admin_all && !role_key)) return;

  const admin = createSupabaseAdminClient();
  const update: Database["public"]["Tables"]["user_profiles"]["Update"] = {
    tenant_id,
    is_active: true,
    role: admin_all ? "admin" : undefined,
    enabled_modules: admin_all ? ["*"] : enabled_modules ?? undefined,
    role_keys: role_key ? [role_key] : undefined,
  };
  await admin
    .from("user_profiles")
    .update(update)
    .eq("id", user.id)
    .eq("tenant_id", tenant_id);
}
