import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/http";
import { mergeModulePermissions } from "@/lib/permissions";
import type { NextResponse } from "next/server";

/**
 * Garante que o utilizador autenticado pode ver relatórios (admin ou `permissions.reports`).
 */
export async function assertReportsAccess(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("Não autenticado", 401) };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: apiError("Perfil: " + error.message, 500) };
  }
  if (!profile) {
    return { ok: false, response: apiError("Perfil não encontrado", 403) };
  }

  if (profile.role === "admin") {
    return { ok: true };
  }

  const p = mergeModulePermissions(profile.permissions);
  if (!p.reports) {
    return { ok: false, response: apiError("Sem acesso a relatórios", 403) };
  }

  return { ok: true };
}
