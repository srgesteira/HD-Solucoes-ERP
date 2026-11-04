import type { Tables } from "@/modules/core/types/database";
import {
  fmtQuoteBRL,
  fmtQuoteDay,
  formatQuoteNumberWithRevision,
  unwrapQuoteCustomer,
  type QuotePrintData,
} from "@/modules/vendas/lib/sales/quote-display";
import { generateQuotePdfBuffer } from "@/modules/vendas/lib/sales/generate-quote-pdf";
import { sendOutboundEmail } from "@/shared/utils/email/send-outbound-email";
import { resolveMailConfig } from "@/shared/utils/email/mail-config";
import type { SendOutboundEmailResult } from "@/shared/utils/email/send-outbound-email";
import {
  sendViaZohoMailApi,
  type ZohoSendResult,
} from "@/shared/utils/email/zoho-mail-api";

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function quoteFileName(q: QuotePrintData): string {
  const number = formatQuoteNumberWithRevision(
    q.quote_number,
    q.revision_number
  );
  const safe = number.replace(/[^a-zA-Z0-9._-]+/g, "_").trim() || "orcamento";
  return `Orcamento-${safe}.pdf`;
}

export type SendQuoteEmailArgs = {
  quote: QuotePrintData;
  company: Tables<"company_settings"> | null | undefined;
  toOverride?: string[];
  customMessage?: string | null;
};

/**
 * Envia o orçamento ao cliente com o PDF anexo.
 *
 * §2.5 do documento funcional: "envio real por email com PDF anexo",
 * estendendo o caminho do Resend que já existe no módulo Compras
 * (princípio §1.1 — uma fonte de verdade).
 */
export async function sendQuoteEmail(
  args: SendQuoteEmailArgs
): Promise<SendOutboundEmailResult> {
  const { quote, company } = args;
  const cust = unwrapQuoteCustomer(quote.customer, quote.client_name);

  const recipients = (
    args.toOverride?.length
      ? args.toOverride
      : [quote.client_email ?? cust?.email].filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        )
  ).map((e) => e.trim());

  if (recipients.length === 0) {
    return {
      sent: false,
      simulated: true,
      message:
        "Cliente sem e-mail cadastrado — preencha o e-mail no orçamento ou forneça destinatário.",
    };
  }

  const number = formatQuoteNumberWithRevision(
    quote.quote_number,
    quote.revision_number
  );
  const subject = `Orçamento ${number} — ${company?.trade_name?.trim() || company?.company_name?.trim() || "HD Industrial"}`;

  const intro =
    args.customMessage?.trim() ||
    `Prezado(a) ${cust?.name ?? quote.client_name ?? "cliente"},\nSegue em anexo o orçamento ${number}, válido até ${fmtQuoteDay(quote.valid_until)}.`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b;">
  <p>${escapeHtml(intro).replace(/\n/g, "<br/>")}</p>
  <table style="border-collapse:collapse;font-size:14px;margin:12px 0;">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Número</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(number)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Data</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(fmtQuoteDay(quote.quote_date))}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Validade</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(fmtQuoteDay(quote.valid_until))}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Total</td><td style="padding:4px 0;font-weight:700;">${escapeHtml(fmtQuoteBRL(Number(quote.total)))}</td></tr>
  </table>
  <p>O detalhamento completo está no PDF em anexo.</p>
  <p style="margin-top:20px;font-size:12px;color:#64748b;">
    ${escapeHtml(company?.trade_name?.trim() || company?.company_name?.trim() || "HD Industrial")}<br/>
    ${escapeHtml([company?.phone?.trim(), company?.email?.trim(), company?.website?.trim()].filter(Boolean).join(" · "))}
  </p>
</body></html>`;

  const pdfBuffer = await generateQuotePdfBuffer(quote, company);

  return sendOutboundEmail({
    to: recipients,
    subject,
    html,
    mail: resolveMailConfig(company),
    attachments: [
      {
        filename: quoteFileName(quote),
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

/* ---------- Envio pela API do Zoho Mail (com confirmação na UI) ---------- */

function companyDisplayName(company: Tables<"company_settings"> | null | undefined): string {
  return company?.trade_name?.trim() || company?.company_name?.trim() || "HD Industrial";
}

export type QuoteEmailDraft = {
  to: string[];
  cc: string[];
  subject: string;
  /** Corpo em texto simples (editável na UI; convertido para HTML no envio). */
  body: string;
};

/**
 * Rascunho do e-mail do orçamento (destinatário, assunto e corpo padrão) para o
 * modal de confirmação. `quote.revision_number` deve ser a revisão que irá no PDF.
 */
export function buildQuoteEmailDraft(
  quote: QuotePrintData,
  company: Tables<"company_settings"> | null | undefined
): QuoteEmailDraft {
  const cust = unwrapQuoteCustomer(quote.customer, quote.client_name);
  const to = [quote.client_email ?? cust?.email]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((e) => e.trim());
  const number = formatQuoteNumberWithRevision(quote.quote_number, quote.revision_number);
  const name = companyDisplayName(company);
  const contact = [company?.phone?.trim(), company?.email?.trim(), company?.website?.trim()]
    .filter(Boolean)
    .join(" · ");
  const body = [
    `Prezado(a) ${cust?.name ?? quote.client_name ?? "cliente"},`,
    "",
    `Segue em anexo o orçamento ${number}, válido até ${fmtQuoteDay(quote.valid_until)}.`,
    "",
    `Número: ${number}`,
    `Data: ${fmtQuoteDay(quote.quote_date)}`,
    `Validade: ${fmtQuoteDay(quote.valid_until)}`,
    `Total: ${fmtQuoteBRL(Number(quote.total))}`,
    "",
    "O detalhamento completo está no PDF em anexo. Ficamos à disposição para qualquer dúvida.",
    "",
    "Atenciosamente,",
    name,
    ...(contact ? [contact] : []),
  ].join("\n");
  return { to, cc: [], subject: `Orçamento ${number} — ${name}`, body };
}

/** Converte o corpo em texto simples (editado pelo utilizador) em HTML seguro. */
export function quoteEmailBodyToHtml(body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n  ");
  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;">
  ${paragraphs}
</body></html>`;
}

export type SendQuoteEmailZohoArgs = {
  quote: QuotePrintData;
  company: Tables<"company_settings"> | null | undefined;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
};

/** Gera o PDF (função existente) e envia pela API do Zoho Mail. Lança erro se falhar. */
export async function sendQuoteEmailViaZoho(
  args: SendQuoteEmailZohoArgs
): Promise<ZohoSendResult> {
  const pdfBuffer = await generateQuotePdfBuffer(args.quote, args.company);
  return sendViaZohoMailApi({
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    html: quoteEmailBodyToHtml(args.body),
    attachments: [
      {
        filename: quoteFileName(args.quote),
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
