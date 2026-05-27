import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { effectivePermissions } from "@/shared/auth/permissions";
import { normalizeEnabledModules } from "@/shared/auth/menu-modules";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const { loadProfileAccess } = await import("@/modules/core/lib/profile-access");
  let profile;
  try {
    profile = await loadProfileAccess(user.id);
  } catch (e) {
    return apiError(
      "Perfil: " + (e instanceof Error ? e.message : "erro"),
      500
    );
  }

  const role =
    (profile?.role as "admin" | "member" | undefined) ?? "member";

  return apiOk({
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    full_name: profile?.full_name ?? null,
    role,
    permissions: effectivePermissions(role, profile?.permissions),
    enabled_modules: normalizeEnabledModules(
      profile?.enabled_modules ?? null,
      role
    ),
    role_keys: profile?.role_keys ?? [],
  });
}
