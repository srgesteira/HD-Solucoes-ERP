import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getBlingAppConfig } from "@/modules/fiscal/lib/bling/bling-env";
import {
  handleBlingInvoiceWebhook,
  resolveTenantFromBlingWebhook,
  verifyBlingWebhookSignature,
} from "@/modules/fiscal/lib/bling/bling-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature =
    request.headers.get("x-bling-signature-256") ??
    request.headers.get("X-Bling-Signature-256");

  try {
    getBlingAppConfig();
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Bling não configurado.", 500);
  }

  if (!verifyBlingWebhookSignature(raw, signature)) {
    return apiError("Assinatura do webhook Bling inválida.", 401);
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return apiError("Body JSON inválido.", 400);
  }

  const admin = createSupabaseAdminClient();
  try {
    const tenantId = await resolveTenantFromBlingWebhook(admin, payload);
    const result = await handleBlingInvoiceWebhook(admin, tenantId, payload);
    return apiOk({ ok: true, ...result });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao processar webhook Bling.",
      400
    );
  }
}
