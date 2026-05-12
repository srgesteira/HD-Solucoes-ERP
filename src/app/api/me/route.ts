import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/http";
import { effectivePermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return apiError("Perfil: " + error.message, 500);
  }

  const role =
    (profile?.role as "admin" | "member" | undefined) ?? "member";

  return apiOk({
    id: user.id,
    role,
    permissions: effectivePermissions(role, profile?.permissions),
  });
}
