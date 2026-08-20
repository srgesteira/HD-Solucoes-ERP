import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { getBlingAppConfig } from "@/modules/fiscal/lib/bling/bling-env";
import {
  parseBlingNfeSnapshot,
  unwrapBlingData,
} from "@/modules/fiscal/lib/bling/bling-nfe-status";
import { applyBlingNfeSnapshot } from "@/modules/fiscal/lib/bling/bling-apply-status";
import { blingGet } from "@/modules/fiscal/lib/bling/bling-client";

type Admin = SupabaseClient<Database>;

/**
 * Valida `X-Bling-Signature-256` (HMAC-SHA256 do body com o client secret).
 * @see https://developer.bling.com.br/webhooks
 */
export function verifyBlingWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const { clientSecret } = getBlingAppConfig();
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", clientSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length) {
    return provided === expected;
  }
  return timingSafeEqual(a, b);
}

function extractBlingNfeId(payload: unknown): number | null {
  const data = unwrapBlingData(payload);
  const candidates = [
    data?.id,
    (payload as { data?: { id?: unknown } } | null)?.data?.id,
    (payload as { idNotaFiscal?: unknown } | null)?.idNotaFiscal,
    (payload as { resourceId?: unknown } | null)?.resourceId,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isInvoiceEvent(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const event = String(o.event ?? o.evento ?? o.modulo ?? "").toLowerCase();
  return /invoice|nota|nfe/.test(event) || extractBlingNfeId(payload) != null;
}

export async function handleBlingInvoiceWebhook(
  admin: Admin,
  tenantId: string | null,
  payload: unknown
): Promise<{ handled: boolean; nfe_id?: string }> {
  if (!isInvoiceEvent(payload)) return { handled: false };
  const blingId = extractBlingNfeId(payload);
  if (!blingId) return { handled: false };

  const db = asUntypedAdmin(admin);
  let q = db
    .from("nfes")
    .select("id, tenant_id")
    .eq("provider", "bling")
    .eq("bling_nfe_id", blingId);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; tenant_id: string } | null;
  if (!row) return { handled: false };

  const detail = await blingGet(admin, row.tenant_id, `/nfe/${blingId}`);
  const snapshot = parseBlingNfeSnapshot(detail, blingId);
  await applyBlingNfeSnapshot(admin, row.tenant_id, row.id, snapshot);
  return { handled: true, nfe_id: row.id };
}

export async function resolveTenantFromBlingWebhook(
  admin: Admin,
  payload: unknown
): Promise<string | null> {
  const blingId = extractBlingNfeId(payload);
  if (!blingId) return null;
  const db = asUntypedAdmin(admin);
  const { data } = await db
    .from("nfes")
    .select("tenant_id")
    .eq("provider", "bling")
    .eq("bling_nfe_id", blingId)
    .maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}
