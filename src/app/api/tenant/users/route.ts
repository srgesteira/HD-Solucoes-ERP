import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";

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
    .select(
      "id, email, full_name, role, is_active, avatar_url, permissions, enabled_modules, role_keys"
    )
    .eq("tenant_id", me.tenant_id)
    .order("full_name", { ascending: true });

  if (error) {
    return apiError("Falha ao listar utilizadores: " + error.message, 500);
  }

  // Enriquecer estado via Auth: convite pendente / suspenso
  const enriched = await Promise.all(
    (rows ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      const au = data?.user ?? null;
      const bannedUntil = au?.banned_until ?? null;
      const invitedAt = au?.invited_at ?? null;
      const confirmedAt = au?.confirmed_at ?? null;
      const lastSignIn = au?.last_sign_in_at ?? null;

      const isBanned =
        typeof bannedUntil === "string" && bannedUntil.length > 0
          ? new Date(bannedUntil).getTime() > Date.now()
          : false;

      const invitePending =
        typeof invitedAt === "string" &&
        invitedAt.length > 0 &&
        (lastSignIn == null || lastSignIn === "") &&
        (confirmedAt == null || confirmedAt === "");

      const status = isBanned || p.is_active === false
        ? "suspended"
        : invitePending
          ? "invite_pending"
          : "active";

      return {
        ...p,
        auth: {
          invited_at: invitedAt,
          last_sign_in_at: lastSignIn,
          banned_until: bannedUntil,
        },
        status,
      };
    })
  );

  return apiOk({ users: enriched });
}
