import type { NextResponse } from "next/server";
import { apiError } from "@/modules/core/lib/http";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { getTenantIdForUserId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";

/**
 * MFA da tela de Aprovações (Fase 4 — Ordem 4).
 * Usa o MFA nativo do Supabase Auth (TOTP / Google Authenticator).
 *
 * "Sessão curta": a decisão só vale se o código do autenticador foi digitado nos últimos
 * MFA_JANELA_MIN minutos. Depois disso a tela pede o código de novo.
 */
export const MFA_JANELA_MIN = 30;

export type MfaGate =
  | { ok: true; userId: string; tenantId: string; mfaEm: number }
  | { ok: false; response: NextResponse };

type AmrEntry = { method?: string; timestamp?: number };

/** Exige administrador logado com MFA (aal2) feito há no máximo MFA_JANELA_MIN minutos. */
export async function requireFreshMfa(): Promise<MfaGate> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: apiError("Faça login.", 401) };
  if (!(await isCurrentUserTenantAdmin())) return { ok: false, response: apiError("Só o administrador.", 403) };
  const tenantId = await getTenantIdForUserId(user.id);
  if (!tenantId) return { ok: false, response: apiError("Tenant não encontrado", 403) };

  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { ok: false, response: apiError("Não foi possível conferir o MFA.", 401) };
  if (data.currentLevel !== "aal2") {
    return { ok: false, response: apiError("Confirme com o código do autenticador (MFA).", 401, { mfa: "necessario" }) };
  }
  const metodos = (data.currentAuthenticationMethods ?? []) as Array<AmrEntry | string>;
  const totp = metodos
    .filter((m): m is AmrEntry => typeof m === "object" && m !== null && m.method === "totp")
    .map((m) => Number(m.timestamp ?? 0))
    .sort((a, b) => b - a)[0];
  if (!totp) {
    return { ok: false, response: apiError("Confirme com o código do autenticador (MFA).", 401, { mfa: "necessario" }) };
  }
  const idadeMin = (Date.now() / 1000 - totp) / 60;
  if (idadeMin > MFA_JANELA_MIN) {
    return {
      ok: false,
      response: apiError(`Sessão de aprovação expirou (${MFA_JANELA_MIN} min). Digite o código de novo.`, 401, {
        mfa: "expirado",
      }),
    };
  }
  return { ok: true, userId: user.id, tenantId, mfaEm: totp };
}
