export type OutboundAttachment = {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
};

export type OutboundMailConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
};

export type SendOutboundEmailArgs = {
  to: string[];
  subject: string;
  html: string;
  attachments?: OutboundAttachment[];
  mail?: OutboundMailConfig | null;
  /** Override do remetente Resend quando não há SMTP. */
  from?: string;
};

export type SendOutboundEmailResult = {
  sent: boolean;
  simulated?: boolean;
  provider?: "zoho_smtp" | "resend";
  message?: string;
};

export function formatMailFrom(name: string | null | undefined, email: string): string {
  const n = name?.trim();
  const e = email.trim();
  if (!n) return e;
  return `${n} <${e}>`;
}

export function mailConfigFromEnv(): OutboundMailConfig | null {
  const user =
    process.env.ZOHO_SMTP_USER?.trim() || process.env.SMTP_USER?.trim() || "";
  const password =
    process.env.ZOHO_SMTP_PASSWORD?.trim() ||
    process.env.SMTP_PASSWORD?.trim() ||
    "";
  if (!user || !password) return null;
  const host =
    process.env.ZOHO_SMTP_HOST?.trim() ||
    process.env.SMTP_HOST?.trim() ||
    "smtp.zoho.com";
  const portRaw = Number(
    process.env.ZOHO_SMTP_PORT?.trim() || process.env.SMTP_PORT?.trim() || 465
  );
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 465;
  const fromEmail =
    process.env.ZOHO_SMTP_FROM?.trim() ||
    process.env.NOTIFICATIONS_EMAIL_FROM?.trim() ||
    user;
  const fromName = process.env.ZOHO_SMTP_FROM_NAME?.trim() || "HD Soluções";
  return {
    host,
    port,
    user,
    password,
    from: fromEmail.includes("<") ? fromEmail : formatMailFrom(fromName, fromEmail),
    secure: port === 465,
  };
}

export function mailConfigFromCompany(row: {
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
  smtp_from_name?: string | null;
  smtp_from_email?: string | null;
  smtp_secure?: boolean | null;
  company_name?: string | null;
  trade_name?: string | null;
  email?: string | null;
} | null | undefined): OutboundMailConfig | null {
  if (!row) return null;
  const user = row.smtp_user?.trim() || "";
  const password = row.smtp_password?.trim() || "";
  if (!user || !password) return null;
  const fromEmail = row.smtp_from_email?.trim() || user;
  const fromName =
    row.smtp_from_name?.trim() ||
    row.trade_name?.trim() ||
    row.company_name?.trim() ||
    "HD Soluções";
  const port = Number(row.smtp_port ?? 465);
  return {
    host: row.smtp_host?.trim() || "smtp.zoho.com",
    port: Number.isFinite(port) && port > 0 ? port : 465,
    user,
    password,
    from: formatMailFrom(fromName, fromEmail),
    secure: row.smtp_secure !== false && (Number.isFinite(port) ? port === 465 : true),
  };
}

export function resolveMailConfig(
  company?: Parameters<typeof mailConfigFromCompany>[0]
): OutboundMailConfig | null {
  return mailConfigFromCompany(company) ?? mailConfigFromEnv();
}
