import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  currentUserCanModule,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { sendQuoteEmail } from "@/modules/vendas/lib/sales/send-quote-email";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import type { QuotePrintData } from "@/modules/vendas/lib/sales/quote-display";
import type { Tables } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const QUOTE_DETAIL_SELECT = `
  *,
  customer:customers(id, name, document, email, phone, address),
  items:quote_items(
    *,
    product:products!quote_items_product_id_fkey(*)
  )
`.trim();

function parseRecipients(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s;,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canSales = await currentUserCanModule("sales");
  if (!isAdmin && !canSales) {
    return apiError("Sem permissão para enviar orçamentos", 403);
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    /* body opcional */
  }

  const toOverride = parseRecipients(body.to ?? body.recipients);
  const customMessage =
    typeof body.message === "string" ? body.message : null;

  const admin = createSupabaseAdminClient();

  const { data: quote, error: quoteErr } = await admin
    .from("quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (quoteErr) {
    return apiError("Erro ao buscar orçamento: " + quoteErr.message, 500);
  }
  if (!quote) return apiError("Orçamento não encontrado", 404);

  const { data: company } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let result;
  try {
    result = await sendQuoteEmail({
      quote: quote as unknown as QuotePrintData,
      company: company as Tables<"company_settings"> | null,
      toOverride: toOverride.length > 0 ? toOverride : undefined,
      customMessage,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao enviar e-mail";
    return apiError(message, 500);
  }

  if (result.sent) {
    const status = (quote as { status?: string }).status;
    if (status === "draft" || status === "revision") {
      await admin
        .from("quotes")
        .update({ status: "sent" })
        .eq("id", id)
        .eq("tenant_id", tenantId);
    }
  }

  await recordAuditEvent(admin, {
    tenantId,
    actorId: user.id,
    actorEmail: user.email ?? null,
    table: "quotes",
    recordId: id,
    eventKind: result.sent ? "quote_email_sent" : "quote_email_simulated",
    payload: {
      to: toOverride,
      message: customMessage ? customMessage.slice(0, 200) : null,
      simulated: result.simulated ?? false,
    },
  });

  return apiOk({
    sent: result.sent,
    simulated: result.simulated ?? false,
    message: result.message ?? null,
  });
}
