import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { syncInviteProfileFromUser } from "@/shared/auth/sync-invite-profile";

export const dynamic = "force-dynamic";

/** Sincroniza metadata do convite → user_profiles após ativação no browser. */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  try {
    await syncInviteProfileFromUser(user);
    return apiOk({ ok: true });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao sincronizar perfil",
      500
    );
  }
}
