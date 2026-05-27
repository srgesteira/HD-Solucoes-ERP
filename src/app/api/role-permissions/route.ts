import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

/** GET /api/role-permissions — cargos R2 para dropdown. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const { data: me } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (me?.role !== "admin") {
    return apiError("Apenas administradores.", 403);
  }

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("role_permissions")
    .select("role_key, role_name, module_keys, module_key, description")
    .order("role_name", { ascending: true });

  if (error) {
    return apiError("Erro ao listar cargos: " + error.message, 500);
  }

  return apiOk({ roles: data ?? [] });
}
