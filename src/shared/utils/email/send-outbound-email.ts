/**
 * Envio de e-mail do ERP: Zoho SMTP (caixa da empresa) ou Resend.
 */

import nodemailer from "nodemailer";
import {
  mailConfigFromEnv,
  type OutboundAttachment,
  type OutboundMailConfig,
  type SendOutboundEmailArgs,
  type SendOutboundEmailResult,
} from "@/shared/utils/email/mail-config";

export type {
  OutboundAttachment,
  OutboundMailConfig,
  SendOutboundEmailArgs,
  SendOutboundEmailResult,
};
export type SendResendEmailArgs = SendOutboundEmailArgs;
export type ResendAttachment = OutboundAttachment;
export type SendResendEmailResult = SendOutboundEmailResult;

function defaultResendFrom(): string {
  return (
    process.env.NOTIFICATIONS_EMAIL_FROM?.trim() ||
    "ERP HD Soluções <onboarding@resend.dev>"
  );
}

function dedupeRecipients(to: string[]): string[] {
  return [...new Set(to.map((e) => e.trim()).filter(Boolean))];
}

async function sendViaSmtp(
  mail: OutboundMailConfig,
  args: SendOutboundEmailArgs,
  recipients: string[]
): Promise<SendOutboundEmailResult> {
  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure || mail.port === 465,
    auth: { user: mail.user, pass: mail.password },
  });
  await transporter.sendMail({
    from: args.from?.trim() || mail.from,
    to: recipients.join(", "),
    subject: args.subject,
    html: args.html,
    attachments: args.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content),
      contentType: a.contentType,
    })),
  });
  return {
    sent: true,
    provider: "zoho_smtp",
    message: `E-mail enviado (Zoho) para ${recipients.join(", ")}.`,
  };
}

async function sendViaResend(
  args: SendOutboundEmailArgs,
  recipients: string[]
): Promise<SendOutboundEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      sent: false,
      simulated: true,
      message:
        "Zoho Mail e RESEND_API_KEY não configurados — envio simulado. Ligue o e-mail em Empresa → Integrações.",
    };
  }

  const payload: Record<string, unknown> = {
    from: args.from?.trim() || defaultResendFrom(),
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
    provider: "resend",
    message: `E-mail enviado para ${recipients.join(", ")}.`,
  };
}

export async function sendOutboundEmail(
  args: SendOutboundEmailArgs
): Promise<SendOutboundEmailResult> {
  const recipients = dedupeRecipients(args.to);
  if (recipients.length === 0) {
    throw new Error("Indique pelo menos um destinatário.");
  }
  const mail = args.mail ?? mailConfigFromEnv();
  if (mail) return sendViaSmtp(mail, args, recipients);
  return sendViaResend(args, recipients);
}

/** @deprecated Use sendOutboundEmail — mantido para os fluxos já existentes. */
export async function sendResendEmail(
  args: SendOutboundEmailArgs
): Promise<SendOutboundEmailResult> {
  return sendOutboundEmail(args);
}
