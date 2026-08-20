import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  BLING_AUTHORIZE_URL,
  BLING_OAUTH_STATE_TTL_MS,
  BLING_REVOKE_URL,
  getBlingAppConfig,
} from "@/modules/fiscal/lib/bling/bling-env";
import {
  exchangeBlingToken,
  persistBlingTokens,
} from "@/modules/fiscal/lib/bling/bling-client";
import { ensureBlingInvoiceWebhook } from "@/modules/fiscal/lib/bling/bling-webhook-register";

type Admin = SupabaseClient<Database>;

export function buildBlingAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getBlingAppConfig();
  const url = new URL(BLING_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function createBlingOAuthState(
  admin: Admin,
  tenantId: string,
  userId: string | null
): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const db = asUntypedAdmin(admin);
  const { error } = await db.from("bling_oauth_states").insert({
    state,
    tenant_id: tenantId,
    created_by: userId,
    expires_at: new Date(Date.now() + BLING_OAUTH_STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return state;
}

export async function consumeBlingOAuthState(
  admin: Admin,
  state: string
): Promise<{ tenant_id: string } | null> {
  const trimmed = state.trim();
  if (!trimmed) return null;
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("bling_oauth_states")
    .select("state, tenant_id, expires_at")
    .eq("state", trimmed)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    state: string;
    tenant_id: string;
    expires_at: string;
  } | null;
  if (!row) return null;

  await db.from("bling_oauth_states").delete().eq("state", trimmed);

  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { tenant_id: row.tenant_id };
}

export async function completeBlingOAuth(
  admin: Admin,
  tenantId: string,
  code: string
): Promise<void> {
  const { redirectUri } = getBlingAppConfig();
  const tokens = await exchangeBlingToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: code.trim(),
      redirect_uri: redirectUri,
    })
  );
  await persistBlingTokens(admin, tenantId, tokens);
  try {
    await ensureBlingInvoiceWebhook(admin, tenantId);
  } catch {
    // Webhook é preferível mas não bloqueia a ligação — o polling cobre o status.
  }
}

export async function disconnectBling(
  admin: Admin,
  tenantId: string
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { data } = await db
    .from("bling_credentials")
    .select("access_token, refresh_token")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as {
    access_token?: string;
    refresh_token?: string;
  } | null;

  const { clientId, clientSecret } = getBlingAppConfig();
  const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
  for (const token of [row?.access_token, row?.refresh_token]) {
    if (!token) continue;
    try {
      await fetch(BLING_REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basic,
          "Content-Type": "application/x-www-form-urlencoded",
          "enable-jwt": "1",
        },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      /* revogação best-effort */
    }
  }

  const { error } = await db
    .from("bling_credentials")
    .delete()
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
