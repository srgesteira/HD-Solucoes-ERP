/** Campos mínimos do utilizador Auth usados para estado na UI. */
export type AuthUserStatusInput = {
  invited_at?: string | null;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type TenantUserStatus = "active" | "invite_pending" | "suspended";

/** Utilizador nunca concluiu o primeiro acesso (sem login e sem confirmação). */
export function authUserNeedsActivation(au: AuthUserStatusInput | null): boolean {
  if (!au) return false;
  if (au.user_metadata?.must_set_password === true) return true;
  const lastSignIn = au.last_sign_in_at ?? null;
  const confirmedAt = au.confirmed_at ?? au.email_confirmed_at ?? null;
  const neverSignedIn = lastSignIn == null || lastSignIn === "";
  const neverConfirmed = confirmedAt == null || confirmedAt === "";
  return neverSignedIn && neverConfirmed;
}

export function resolveTenantUserStatus(
  profileIsActive: boolean | null | undefined,
  au: AuthUserStatusInput | null
): TenantUserStatus {
  const bannedUntil = au?.banned_until ?? null;
  const isBanned =
    typeof bannedUntil === "string" &&
    bannedUntil.length > 0 &&
    new Date(bannedUntil).getTime() > Date.now();

  if (isBanned || profileIsActive === false) return "suspended";
  if (authUserNeedsActivation(au)) return "invite_pending";
  return "active";
}
