/**
 * Constantes e env da integração Bling API v3.
 * @see https://developer.bling.com.br/bling-api
 * @see https://developer.bling.com.br/aplicativos
 * @see https://developer.bling.com.br/migracao-url
 */

export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
/** Authorization server OAuth2 (authorize + token + revoke). */
export const BLING_OAUTH_BASE = "https://www.bling.com.br/Api/v3";

export const BLING_AUTHORIZE_URL = `${BLING_OAUTH_BASE}/oauth/authorize`;
export const BLING_TOKEN_URL = `${BLING_OAUTH_BASE}/oauth/token`;
export const BLING_REVOKE_URL = `${BLING_OAUTH_BASE}/oauth/revoke`;

/** Access token: renovar 60s antes de expires_at. Refresh token: 30 dias (docs). */
export const BLING_ACCESS_TOKEN_SKEW_MS = 60_000;
export const BLING_AUTH_CODE_TTL_MS = 60_000;
export const BLING_OAUTH_STATE_TTL_MS = 10 * 60_000;

/** Limite oficial: 3 req/s. */
export const BLING_MIN_INTERVAL_MS = 350;

export type BlingAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function blingAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function getBlingAppConfig(): BlingAppConfig {
  const clientId = process.env.BLING_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.BLING_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = (
    process.env.BLING_REDIRECT_URI?.trim() ||
    `${blingAppUrl()}/api/integrations/bling/callback`
  ).replace(/\/$/, "");

  if (!clientId || !clientSecret) {
    throw new Error(
      "Integração Bling não configurada: defina BLING_CLIENT_ID e BLING_CLIENT_SECRET."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function blingWebhookUrl(): string {
  return `${blingAppUrl()}/api/integrations/bling/webhook`;
}
