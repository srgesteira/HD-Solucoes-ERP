import type { Tables } from "@/modules/core/types/database";
import {
  fmtQuoteBRL,
  fmtQuoteDay,
  formatQuoteNumberWithRevision,
  unwrapQuoteCustomer,
  type QuotePrintData,
} from "@/modules/vendas/lib/sales/quote-display";
import { generateQuotePdfBuffer } from "@/modules/vendas/lib/sales/generate-quote-pdf";
import {
  sendResendEmail,
  type SendResendEmailResult,
} from "@/shared/utils/email/send-resend-email";

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quoteFileName(q: QuotePrintData): string {
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
): Promise<SendResendEmailResult> {
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
  const subject = `Orçamento ${number} — ${company?.trade_name?.trim() || company?.company_name?.trim() || "HD Soluções"}`;

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
    ${escapeHtml(company?.trade_name?.trim() || company?.company_name?.trim() || "HD Soluções Industriais")}<br/>
    ${escapeHtml([company?.phone?.trim(), company?.email?.trim(), company?.website?.trim()].filter(Boolean).join(" · "))}
  </p>
</body></html>`;

  const pdfBuffer = await generateQuotePdfBuffer(quote, company);

  return sendResendEmail({
    to: recipients,
    subject,
    html,
    attachments: [
      {
        filename: quoteFileName(quote),
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
