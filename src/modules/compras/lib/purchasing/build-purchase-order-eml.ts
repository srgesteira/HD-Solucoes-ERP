/** Mensagem .eml (RFC 822) com PDF em anexo — abre no Zoho Mail com ficheiro incluído. */

export type BuildPurchaseOrderEmlArgs = {
  to?: string | null;
  subject: string;
  body: string;
  attachmentFilename: string;
  attachmentBase64: string;
};

function wrapBase64(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_") || "pedido.pdf";
}

export function buildPurchaseOrderEml(args: BuildPurchaseOrderEmlArgs): string {
  const boundary = `----=_ERP_${Date.now().toString(36)}`;
  const to = args.to?.trim() ?? "";
  const subject = escapeHeaderValue(args.subject);
  const attachmentName = sanitizeFilename(args.attachmentFilename);
  const b64 = wrapBase64(args.attachmentBase64.replace(/\s/g, ""));

  const headers = [
    "MIME-Version: 1.0",
    ...(to ? [`To: ${to}`] : []),
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
  ];

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    args.body.replace(/\n/g, "\r\n"),
    "",
  ].join("\r\n");

  const attachmentPart = [
    `--${boundary}`,
    `Content-Type: application/pdf; name="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    b64,
    "",
  ].join("\r\n");

  const closing = `--${boundary}--\r\n`;

  return `${headers.join("\r\n")}${textPart}${attachmentPart}${closing}`;
}

export function emlFilenameForPo(poNumber: string): string {
  return `pedido-${poNumber.replace(/[^\w.\-/]+/g, "_")}.eml`;
}
