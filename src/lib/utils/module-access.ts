import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/http";
import { mergeModulePermissions, type ModuleKey } from "@/lib/permissions";
import type { NextResponse } from "next/server";

/**
 * Acesso a um módulo (admin ou flag em `user_profiles.permissions`).
 */
export async function assertModuleAccess(
  module: ModuleKey
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
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
  if (!p[module]) {
    return { ok: false, response: apiError("Sem acesso a este módulo", 403) };
  }

  return { ok: true };
}

/** Relatórios financeiros: Financeiro ou Relatórios (legado). */
export async function assertFinanceOrReportsAccess(): Promise<
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
  if (p.finance || p.reports) {
    return { ok: true };
  }

  return {
    ok: false,
    response: apiError("Sem acesso a relatórios financeiros", 403),
  };
}

/** Produção ou Relatórios (legado). */
export async function assertProductionOrReportsAccess(): Promise<
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
  if (p.production || p.reports) {
    return { ok: true };
  }

  return { ok: false, response: apiError("Sem acesso", 403) };
}

/** Vendas ou Relatórios (legado). */
export async function assertSalesOrReportsAccess(): Promise<
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
  if (p.sales || p.reports) {
    return { ok: true };
  }

  return { ok: false, response: apiError("Sem acesso", 403) };
}
