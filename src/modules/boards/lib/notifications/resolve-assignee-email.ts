import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

/**
 * E-mail para notificações ao responsável: primeiro `user_profiles.email`;
 * se vazio, usa o e-mail de registo no Supabase Auth (cadastro/login).
 */
export async function resolveAssigneeCadastroEmail(
  admin: SupabaseClient<Database>,
  userId: string,
  profileEmail: string | null | undefined
): Promise<string | null> {
  const fromProfile = profileEmail?.trim();
  if (fromProfile) return fromProfile;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email?.trim()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[notify] Responsável sem e-mail em perfil nem no Auth:",
        userId,
        error?.message ?? ""
      );
    }
    return null;
  }
  return data.user.email.trim();
}
