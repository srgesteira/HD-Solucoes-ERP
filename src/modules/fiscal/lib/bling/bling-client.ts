/**
 * Client HTTP autenticado da API v3 do Bling.
 * OAuth2 Bearer + refresh automático (o Bling rota o refresh_token a cada renovação).
 * @see https://developer.bling.com.br/aplicativos
 * @see https://developer.bling.com.br/migracao-jwt
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  BLING_API_BASE,
  BLING_MIN_INTERVAL_MS,
  BLING_ACCESS_TOKEN_SKEW_MS,
  BLING_TOKEN_URL,
  getBlingAppConfig,
} from "@/modules/fiscal/lib/bling/bling-env";
import {
  BlingApiError,
  blingErrorCode,
  messageFromBlingBody,
} from "@/modules/fiscal/lib/bling/bling-errors";

type Admin = SupabaseClient<Database>;

type CredentialRow = {
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  token_type: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

const lastRequestAt = new Map<string, number>();

async function throttle(tenantId: string): Promise<void> {
  const last = lastRequestAt.get(tenantId) ?? 0;
  const wait = BLING_MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt.set(tenantId, Date.now());
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

export async function exchangeBlingToken(
  body: URLSearchParams
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getBlingAppConfig();
  const res = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "enable-jwt": "1",
    },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: unknown;
  };
  if (!res.ok || !json.access_token) {
    throw new BlingApiError(
      messageFromBlingBody(json, res.status),
      res.status,
      blingErrorCode(json)
    );
  }
  return json;
}

export async function persistBlingTokens(
  admin: Admin,
  tenantId: string,
  tokens: TokenResponse
): Promise<void> {
  const access = tokens.access_token?.trim();
  const refresh = tokens.refresh_token?.trim();
  if (!access || !refresh) {
    throw new Error("Bling não devolveu access_token e refresh_token.");
  }
  const expiresIn = Number(tokens.expires_in ?? 21600);
  const expiresAt = new Date(
    Date.now() + Math.max(60, expiresIn) * 1000
  ).toISOString();

  const db = asUntypedAdmin(admin);
  const { error } = await db.rpc("fn_bling_save_tokens", {
    p_tenant_id: tenantId,
    p_access_token: access,
    p_refresh_token: refresh,
    p_expires_at: expiresAt,
    p_scope: tokens.scope ?? null,
    p_token_type: tokens.token_type ?? "Bearer",
  });
  if (error) throw new Error(error.message);
}

async function loadCredentials(
  admin: Admin,
  tenantId: string
): Promise<CredentialRow | null> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("bling_credentials")
    .select("tenant_id, access_token, refresh_token, expires_at, scope, token_type")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CredentialRow | null) ?? null;
}

export async function getBlingConnectionStatus(
  admin: Admin,
  tenantId: string
): Promise<{
  connected: boolean;
  expires_at: string | null;
  connected_at: string | null;
  scope: string | null;
}> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("bling_credentials")
    .select("expires_at, connected_at, scope")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    expires_at: string;
    connected_at: string;
    scope: string | null;
  } | null;
  return {
    connected: Boolean(row),
    expires_at: row?.expires_at ?? null,
    connected_at: row?.connected_at ?? null,
    scope: row?.scope ?? null,
  };
}

async function refreshAccessToken(
  admin: Admin,
  tenantId: string,
  refreshToken: string
): Promise<CredentialRow> {
  const tokens = await exchangeBlingToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
  await persistBlingTokens(admin, tenantId, tokens);
  const next = await loadCredentials(admin, tenantId);
  if (!next) throw new Error("Falha ao gravar tokens Bling após refresh.");
  return next;
}

async function getValidAccessToken(
  admin: Admin,
  tenantId: string
): Promise<string> {
  let creds = await loadCredentials(admin, tenantId);
  if (!creds) {
    throw new BlingApiError(
      "Bling não está ligado. Autorize a integração em Configurações da empresa.",
      401
    );
  }
  const expiresAt = new Date(creds.expires_at).getTime();
  if (expiresAt - BLING_ACCESS_TOKEN_SKEW_MS <= Date.now()) {
    creds = await refreshAccessToken(admin, tenantId, creds.refresh_token);
  }
  return creds.access_token;
}

export type BlingRequestResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function blingRequest<T = unknown>(
  admin: Admin,
  tenantId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<BlingRequestResult<T>> {
  const url = path.startsWith("http") ? path : `${BLING_API_BASE}${path}`;

  const doFetch = async (accessToken: string) => {
    await throttle(tenantId);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "enable-jwt": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 500) };
      }
    }
    return { res, data };
  };

  let token = await getValidAccessToken(admin, tenantId);
  let { res, data } = await doFetch(token);

  if (res.status === 401) {
    const creds = await loadCredentials(admin, tenantId);
    if (creds) {
      await refreshAccessToken(admin, tenantId, creds.refresh_token);
      token = await getValidAccessToken(admin, tenantId);
      ({ res, data } = await doFetch(token));
    }
  }

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1100));
    token = await getValidAccessToken(admin, tenantId);
    ({ res, data } = await doFetch(token));
  }

  const ok = res.status >= 200 && res.status < 300;
  if (!ok) {
    throw new BlingApiError(
      messageFromBlingBody(data, res.status),
      res.status,
      blingErrorCode(data)
    );
  }

  return { ok: true, status: res.status, data: data as T };
}

export async function blingGet<T = unknown>(
  admin: Admin,
  tenantId: string,
  path: string
): Promise<T> {
  const out = await blingRequest<T>(admin, tenantId, "GET", path);
  return out.data;
}

export async function blingPost<T = unknown>(
  admin: Admin,
  tenantId: string,
  path: string,
  body?: unknown
): Promise<T> {
  const out = await blingRequest<T>(admin, tenantId, "POST", path, body);
  return out.data;
}

export async function blingDelete<T = unknown>(
  admin: Admin,
  tenantId: string,
  path: string
): Promise<T> {
  const out = await blingRequest<T>(admin, tenantId, "DELETE", path);
  return out.data;
}
