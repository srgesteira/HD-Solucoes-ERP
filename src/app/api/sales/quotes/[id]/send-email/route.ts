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
import {
  buildQuoteEmailDraft,
  sendQuoteEmail,
  sendQuoteEmailViaZoho,
} from "@/modules/vendas/lib/sales/send-quote-email";
import {
  isZohoMailApiConfigured,
  zohoMailApiConfigFromEnv,
} from "@/shared/utils/email/zoho-mail-api";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import type { QuotePrintData } from "@/modules/vendas/lib/sales/quote-display";
import type { Tables } from "@/modules/core/types/database";
import { sortQuoteItemsByLineNumber } from "@/modules/vendas/lib/sales/quote-items-order";
import { nextRevisionOnSend } from "@/modules/vendas/lib/sales/quote-revision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Estados em que o botão Enviar/Reenviar existe. */
const SENDABLE_STATUSES = new Set(["draft", "revision", "sent"]);

type QuoteMeta = {
  status?: string;
  send_count?: number | null;
  revision_number?: number | null;
};

/**
 * Contadores após um envio confirmado:
 * - rascunho/revisão → status "sent", send_count+1 e revisão sobe se já tinha sido enviado;
 * - reenvio de um orçamento já "sent" → só send_count+1 (o conteúdo não mudou).
 */
function countersAfterSend(meta: QuoteMeta): {
  status: string;
  send_count: number;
  revision_number: number;
} | null {
  const status = meta.status ?? "";
  if (!SENDABLE_STATUSES.has(status)) return null;
  if (status === "sent") {
    return {
      status: "sent",
      send_count: Math.max(0, Math.trunc(Number(meta.send_count ?? 0) || 0)) + 1,
      revision_number: Math.max(0, Math.trunc(Number(meta.revision_number ?? 0) || 0)),
    };
  }
  const next = nextRevisionOnSend({
    sendCount: meta.send_count,
    revisionNumber: meta.revision_number,
  });
  return {
    status: "sent",
    send_count: next.send_count,
    revision_number: next.revision_number,
  };
}

type LoadedQuote =
  | { ok: true; quote: QuotePrintData & QuoteMeta; company: Tables<"company_settings"> | null }
  | { ok: false; response: Response };

async function loadQuoteForEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  tenantId: string,
  id: string
): Promise<LoadedQuote> {
  const { data: quote, error: quoteErr } = await admin
    .from("quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (quoteErr) {
    return { ok: false, response: apiError("Erro ao buscar orçamento: " + quoteErr.message, 500) };
  }
  if (!quote) return { ok: false, response: apiError("Orçamento não encontrado", 404) };

  const quoteRow = quote as unknown as Record<string, unknown> & { items?: unknown };
  const quoteSorted = {
    ...quoteRow,
    items: Array.isArray(quoteRow.items)
      ? sortQuoteItemsByLineNumber(
          quoteRow.items as Array<{
            line_number?: number | null;
            created_at?: string | null;
            id?: string | null;
          }>
        )
      : quoteRow.items,
  };

  const { data: company } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    ok: true,
    quote: quoteSorted as unknown as QuotePrintData & QuoteMeta,
    company: (company as Tables<"company_settings"> | null) ?? null,
  };
}

/** Orçamento com a revisão que ficará gravada após o envio (para PDF e assunto). */
function quoteAsWillBeSent(quote: QuotePrintData & QuoteMeta): QuotePrintData {
  const next = countersAfterSend(quote);
  return next ? { ...quote, revision_number: next.revision_number } : quote;
}

async function guardSendAccess(): Promise<
  { ok: true; user: { id: string; email?: string | null }; tenantId: string } | { ok: false; response: Response }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: apiError("Não autenticado", 401) };

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return { ok: false, response: access.response };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, response: apiError("Tenant não encontrado", 403) };

  const isAdmin = await isCurrentUserTenantAdmin();
  const canSales = await currentUserCanModule("sales");
  if (!isAdmin && !canSales) {
    return { ok: false, response: apiError("Sem permissão para enviar orçamentos", 403) };
  }
  return { ok: true, user, tenantId };
}

/**
 * GET — rascunho para o modal de confirmação (nada é enviado).
 * { zohoConfigured, from, to[], cc[], subject, body }
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardSendAccess();
  if (!guard.ok) return guard.response;

  const admin = createSupabaseAdminClient();
  const loaded = await loadQuoteForEmail(admin, guard.tenantId, id);
  if (!loaded.ok) return loaded.response;

  const zoho = zohoMailApiConfigFromEnv();
  const draft = buildQuoteEmailDraft(quoteAsWillBeSent(loaded.quote), loaded.company);
  return apiOk({
    zohoConfigured: zoho !== null,
    from: zoho?.fromAddress ?? null,
    ...draft,
  });
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

  if (isZohoMailApiConfigured()) {
    return sendWithZoho(id, tenantId, user, body);
  }

  // Sem Zoho configurado: comportamento anterior (SMTP da empresa / Resend / simulado).
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

  const quoteRow = quote as unknown as Record<string, unknown> & {
    items?: unknown;
  };
  const quoteSorted = {
    ...quoteRow,
    items: Array.isArray(quoteRow.items)
      ? sortQuoteItemsByLineNumber(
          quoteRow.items as Array<{
            line_number?: number | null;
            created_at?: string | null;
            id?: string | null;
          }>
        )
      : quoteRow.items,
  };

  const { data: company } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let result;
  try {
    result = await sendQuoteEmail({
      quote: quoteSorted as unknown as QuotePrintData,
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
    const quoteMeta = quote as {
      status?: string;
      send_count?: number | null;
      revision_number?: number | null;
    };
    const status = quoteMeta.status;
    if (status === "draft" || status === "revision") {
      const next = nextRevisionOnSend({
        sendCount: quoteMeta.send_count,
        revisionNumber: quoteMeta.revision_number,
      });
      await admin
        .from("quotes")
        .update({
          status: "sent",
          send_count: next.send_count,
          revision_number: next.revision_number,
        })
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

/**
 * Envio real pela API do Zoho Mail — só chamado após confirmação explícita no modal.
 * Os contadores do orçamento só mudam depois de a API confirmar o envio.
 */
async function sendWithZoho(
  id: string,
  tenantId: string,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>
) {
  const to = parseRecipients(body.to ?? body.recipients);
  const cc = parseRecipients(body.cc);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";

  if (body.confirmed !== true) {
    return apiError("Confirme o envio na tela antes de enviar.", 400);
  }
  if (to.length === 0) return apiError("Indique pelo menos um destinatário.", 400);
  const invalid = [...to, ...cc].filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) return apiError(`E-mail inválido: ${invalid.join(", ")}`, 400);
  if (!subject) return apiError("Indique o assunto.", 400);
  if (!text.trim()) return apiError("Indique o corpo do e-mail.", 400);

  const admin = createSupabaseAdminClient();
  const loaded = await loadQuoteForEmail(admin, tenantId, id);
  if (!loaded.ok) return loaded.response;
  const meta = loaded.quote;
  if (!SENDABLE_STATUSES.has(meta.status ?? "")) {
    return apiError("Só é possível enviar orçamentos em rascunho, em revisão ou já enviados.", 400);
  }

  let result;
  try {
    result = await sendQuoteEmailViaZoho({
      quote: quoteAsWillBeSent(meta),
      company: loaded.company,
      to,
      cc,
      subject: subject.slice(0, 500),
      body: text.slice(0, 20000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao enviar e-mail";
    await recordAuditEvent(admin, {
      tenantId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      table: "quotes",
      recordId: id,
      eventKind: "quote_email_failed",
      payload: { provider: "zoho_api", to, cc, subject, error: message.slice(0, 500) },
    });
    return apiError(message, 502);
  }

  const sentAt = new Date().toISOString();
  const next = countersAfterSend(meta);
  let warning: string | null = null;
  if (next) {
    const { error: updErr } = await admin
      .from("quotes")
      .update(next)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (updErr) {
      warning = `E-mail enviado, mas falhou ao atualizar o orçamento: ${updErr.message}`;
    }
  }

  await recordAuditEvent(admin, {
    tenantId,
    actorId: user.id,
    actorEmail: user.email ?? null,
    table: "quotes",
    recordId: id,
    eventKind: "quote_email_sent",
    payload: {
      provider: "zoho_api",
      sent_at: sentAt,
      to,
      cc,
      subject,
      message_id: result.messageId,
      send_count: next?.send_count ?? null,
      revision_number: next?.revision_number ?? null,
    },
  });

  return apiOk({
    sent: true,
    simulated: false,
    provider: "zoho_api",
    sent_at: sentAt,
    message: warning ?? result.message,
  });
}
