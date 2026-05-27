import type { PurchaseOrderExportData } from "@/modules/compras/lib/purchasing/fetch-purchase-order-for-export";
import { fmtPoBRL, fmtPoDate } from "@/modules/compras/lib/purchasing/fetch-purchase-order-for-export";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildItemsTableHtml(order: PurchaseOrderExportData): string {
  const rows = order.items
    .map(
      (l) =>
        `<tr>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(l.description)}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${l.quantity}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;">${escapeHtml(l.unit)}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(fmtPoBRL(l.unit_price))}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(fmtPoBRL(l.total_price))}</td>
        </tr>`
    )
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;max-width:720px;font-size:14px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;">Descrição</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">Qtd</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;">Un.</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">Preço</th>
          <th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export type SendPurchaseOrderEmailResult = {
  sent: boolean;
  simulated?: boolean;
  message?: string;
  warning?: string;
};

export async function sendPurchaseOrderEmail(args: {
  order: PurchaseOrderExportData;
  appOrigin: string;
  toOverride?: string[];
}): Promise<SendPurchaseOrderEmailResult> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.NOTIFICATIONS_EMAIL_FROM?.trim() ??
    "ERP HD Soluções <onboarding@resend.dev>";

  const recipients = [
    ...new Set(
      (args.toOverride?.length
        ? args.toOverride
        : args.order.supplier_email
          ? [args.order.supplier_email]
          : []
      )
        .map((e) => e.trim())
        .filter(Boolean)
    ),
  ];

  if (!recipients.length) {
    return {
      sent: false,
      simulated: true,
      message:
        "Fornecedor sem e-mail cadastrado — envio simulado (configure o e-mail do fornecedor).",
    };
  }

  if (!resendKey) {
    return {
      sent: false,
      simulated: true,
      message: "E-mail enviado (simulado) — RESEND_API_KEY não configurada.",
    };
  }

  const subject = `Pedido de compra ${args.order.po_number}`;
  const printUrl = `${args.appOrigin.replace(/\/$/, "")}/purchasing/orders/${args.order.id}/print`;
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b;">
      <p>Prezado(a) fornecedor,</p>
      <p>Segue o pedido de compra <strong>${escapeHtml(args.order.po_number)}</strong> emitido em ${escapeHtml(fmtPoDate(args.order.order_date))}.</p>
      <p>
        <strong>Fornecedor:</strong> ${escapeHtml(args.order.supplier_name)}<br/>
        <strong>Prazo de entrega:</strong> ${escapeHtml(fmtPoDate(args.order.expected_delivery))}<br/>
        <strong>Total:</strong> ${escapeHtml(fmtPoBRL(args.order.total))}
      </p>
      ${buildItemsTableHtml(args.order)}
      <p style="margin-top:16px;">
        <a href="${escapeHtml(printUrl)}">Ver pedido completo no portal</a>
      </p>
      <p style="margin-top:20px;font-size:12px;color:#64748b;">
        ERP HD Soluções Industriais
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

  return {
    sent: true,
    message: `E-mail enviado para ${recipients.join(", ")}.`,
  };
}
