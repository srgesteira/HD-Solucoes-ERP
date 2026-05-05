import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenant/users — perfis do mesmo tenant (para assignee / futuros filtros).
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("Não autenticado", 401);
  }

  const { data: me, error: meErr } = await supabase
    .from("user_profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr) {
    return apiError("Falha ao carregar perfil: " + meErr.message, 500);
  }
  if (!me?.tenant_id) {
    return apiError("Tenant não encontrado no perfil.", 409);
  }

  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("user_profiles")
    .select("id, email, full_name, role, is_active, avatar_url")
    .eq("tenant_id", me.tenant_id)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    return apiError("Falha ao listar utilizadores: " + error.message, 500);
  }

  return apiOk({ users: rows ?? [] });
}
