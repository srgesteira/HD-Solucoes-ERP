/**
 * Wrapper genérico para envio de emails via Resend.
 *
 * Princípio §1.1 (uma fonte de verdade): centraliza a integração com Resend,
 * para que orçamento, pedido de compra e outros fluxos extendam o mesmo
 * caminho em vez de duplicarem chamadas à API.
 */

export type ResendAttachment = {
  filename: string;
  /** Conteúdo binário (Buffer/Uint8Array) — será serializado em base64. */
  content: Buffer | Uint8Array;
  contentType?: string;
};

export type SendResendEmailArgs = {
  to: string[];
  subject: string;
  html: string;
  attachments?: ResendAttachment[];
  /** Override do remetente; default vem de NOTIFICATIONS_EMAIL_FROM. */
  from?: string;
};

export type SendResendEmailResult = {
  sent: boolean;
  simulated?: boolean;
  message?: string;
};

function defaultFrom(): string {
  return (
    process.env.NOTIFICATIONS_EMAIL_FROM?.trim() ||
    "ERP HD Soluções <onboarding@resend.dev>"
  );
}

function dedupeRecipients(to: string[]): string[] {
  return [...new Set(to.map((e) => e.trim()).filter(Boolean))];
}

export async function sendResendEmail(
  args: SendResendEmailArgs
): Promise<SendResendEmailResult> {
  const recipients = dedupeRecipients(args.to);
  if (recipients.length === 0) {
    throw new Error("Indique pelo menos um destinatário.");
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      sent: false,
      simulated: true,
      message: "RESEND_API_KEY não configurada — envio simulado.",
    };
  }

  const payload: Record<string, unknown> = {
    from: args.from?.trim() || defaultFrom(),
    to: recipients,
    subject: args.subject,
    html: args.html,
  };

  if (args.attachments?.length) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
