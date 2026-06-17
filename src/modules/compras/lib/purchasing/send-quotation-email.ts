export type QuotationEmailLine = {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  need_date?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import { formatShortDate } from "@/shared/utils/date";

function fmtNeedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? iso ?? "—" : formatted;
}

function buildTableHtml(lines: QuotationEmailLine[]): string {
  const showNeedDate = lines.some((l) => l.need_date);
  const rows = lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${escapeHtml(l.code)}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(l.description)}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${l.quantity}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(l.unit)}</td>
          ${
            showNeedDate
              ? `<td style="padding:6px 8px;border:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(fmtNeedDate(l.need_date))}</td>`
              : ""
          }
        </tr>`
    )
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;max-width:720px;font-size:14px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Código</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Descrição</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">Qtd</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Un.</th>
          ${showNeedDate ? '<th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Data necessidade</th>' : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export async function sendPurchaseQuotationEmail(args: {
  to: string[];
  subject?: string;
  message: string;
  lines: QuotationEmailLine[];
}): Promise<{ sent: boolean; warning?: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.NOTIFICATIONS_EMAIL_FROM?.trim() ??
    "ERP HD Soluções <onboarding@resend.dev>";

  const recipients = [...new Set(args.to.map((e) => e.trim()).filter(Boolean))];
  if (!recipients.length) {
    throw new Error("Indique pelo menos um e-mail de fornecedor.");
  }

  if (!resendKey) {
    return {
      sent: false,
      warning:
        "RESEND_API_KEY não configurada — orçamento registado sem envio de e-mail.",
    };
  }

  const subject =
    args.subject?.trim() || "Solicitação de cotação — HD Soluções";
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b;">
      <p>${escapeHtml(args.message).replace(/\n/g, "<br/>")}</p>
      ${buildTableHtml(args.lines)}
      <p style="margin-top:20px;font-size:12px;color:#64748b;">
        ERP HD Soluções Industriais — pedido de cotação automático.
      </p>
    </body>
    </html>
  `.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail (${res.status}): ${txt}`);
  }

  return { sent: true };
}
