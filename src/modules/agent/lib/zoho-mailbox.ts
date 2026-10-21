import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { OutboundMailConfig } from "@/shared/utils/email/mail-config";

/**
 * Caixa de e-mail (Zoho) via IMAP + SMTP, para o assistente ler e responder
 * sem operar a tela. Usa as mesmas credenciais SMTP já configuradas no ERP.
 */

const SIGNATURE_HTML = `
<br><table cellpadding="0" cellspacing="0" style="font-family:Verdana,Arial,sans-serif;font-size:12px;color:#333">
<tr><td style="padding-right:12px;border-right:2px solid #1f6feb"><img src="https://www.hdindustrial.ind.br/marca/logo-hd-industrial-texto-escuro.png" width="90" alt="HD Industrial"></td>
<td style="padding-left:12px"><b style="font-size:14px">Helder Gesteira</b><br>Diretor · HD Industrial<br>
<span style="color:#666">+23 anos em salas limpas e ambientes críticos</span><br>
(11) 98879-5861 · <a href="https://www.hdindustrial.ind.br">www.hdindustrial.ind.br</a><br>
<a href="https://www.linkedin.com/company/hdindustrialbrasil/">LinkedIn</a> · <a href="https://www.instagram.com/hdindustrialbr/">Instagram @hdindustrialbr</a></td></tr></table>`;

function imapClient(cfg: OutboundMailConfig): ImapFlow {
  const host = cfg.host.replace(/^smtp(pro)?\./i, "imap$1.");
  return new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });
}

async function withImap<T>(cfg: OutboundMailConfig, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(cfg);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function folderPath(c: ImapFlow, folder: string): Promise<string> {
  const f = folder.toLowerCase();
  if (f === "inbox" || f === "entrada") return "INBOX";
  if (f === "sent" || f === "enviados" || f === "enviado") {
    const boxes = await c.list();
    return boxes.find((b) => b.specialUse === "\\Sent")?.path ?? "Sent";
  }
  return folder;
}

const fmtAddr = (a?: { name?: string; address?: string }[]) =>
  (a ?? []).map((x) => x.address ?? x.name ?? "?").join(", ");
const fmtDate = (d?: Date | string) => {
  if (!d) return "-";
  const x = new Date(d);
  return x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function line(folder: string, m: FetchMessageObject): string {
  const e = m.envelope;
  const unread = m.flags && !m.flags.has("\\Seen") ? "*" : " ";
  return `${unread}${folder}:${m.uid} ${fmtDate(e?.date)} de ${fmtAddr(e?.from)} p/ ${fmtAddr(e?.to).slice(0, 80)} | ${e?.subject ?? ""}`;
}

/** Lista as mensagens recentes de uma pasta (texto compacto, mais novas primeiro). */
export async function listMessages(cfg: OutboundMailConfig, folder: string, sinceDays: number, limit: number): Promise<string> {
  return withImap(cfg, async (c) => {
    const path = await folderPath(c, folder);
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000);
      const uids = (await c.search({ since }, { uid: true })) || [];
      const pick = uids.slice(-limit);
      if (!pick.length) return `${path}: nada desde ${fmtDate(since)}`;
      const out: string[] = [];
      for await (const m of c.fetch(pick, { envelope: true, flags: true, uid: true }, { uid: true })) {
        out.push(line(folder, m));
      }
      return out.reverse().join("\n");
    } finally {
      lock.release();
    }
  });
}

/** Procura por texto em remetente, destinatário ou assunto nas pastas de entrada e enviados. */
export async function searchMessages(cfg: OutboundMailConfig, q: string, limit: number): Promise<string> {
  return withImap(cfg, async (c) => {
    const out: string[] = [];
    for (const folder of ["inbox", "sent"]) {
      const path = await folderPath(c, folder);
      const lock = await c.getMailboxLock(path, { readOnly: true });
      try {
        const uids =
          (await c.search({ or: [{ from: q }, { to: q }, { cc: q }, { subject: q }] }, { uid: true })) || [];
        const pick = uids.slice(-limit);
        if (!pick.length) continue;
        for await (const m of c.fetch(pick, { envelope: true, flags: true, uid: true }, { uid: true })) {
          out.push(line(folder, m));
        }
      } finally {
        lock.release();
      }
    }
    return out.length ? out.join("\n") : `Nada encontrado para "${q}".`;
  });
}

function stripQuoted(text: string): string {
  const cut = text.search(/\n\s*(De:|From:|-----\s*Original|Em .{5,80} escreveu:|On .{5,80} wrote:|________________)/);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/\n{3,}/g, "\n\n").trim();
}

/** Lê uma mensagem (texto puro, sem o histórico citado). */
export async function readMessage(cfg: OutboundMailConfig, folder: string, uid: number, full: boolean): Promise<string> {
  return withImap(cfg, async (c) => {
    const path = await folderPath(c, folder);
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const msg = await c.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return "Mensagem não encontrada.";
      const p = await simpleParser(msg.source);
      const body = p.text ?? "";
      const att = (p.attachments ?? []).map((a) => `${a.filename ?? "anexo"} (${Math.round((a.size ?? 0) / 1024)} KB)`);
      return [
        `De: ${p.from?.text ?? ""}`,
        `Para: ${Array.isArray(p.to) ? p.to.map((t) => t.text).join(", ") : p.to?.text ?? ""}`,
        p.cc ? `Cc: ${Array.isArray(p.cc) ? p.cc.map((t) => t.text).join(", ") : p.cc.text}` : "",
        `Data: ${fmtDate(p.date)}`,
        `Assunto: ${p.subject ?? ""}`,
        att.length ? `Anexos: ${att.join("; ")}` : "",
        "",
        (full ? body : stripQuoted(body)).slice(0, full ? 12000 : 4000),
      ]
        .filter((x) => x !== "")
        .join("\n");
    } finally {
      lock.release();
    }
  });
}

export type SendArgs = {
  to: string[];
  cc?: string[];
  subject?: string;
  text: string;
  /** Responder em cima de uma mensagem existente (mantém a conversa). */
  reply?: { folder: string; uid: number };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

/** Envia (SMTP) e guarda cópia na pasta Enviados (IMAP), com a assinatura da HD. */
export async function sendMessage(cfg: OutboundMailConfig, args: SendArgs): Promise<string> {
  let subject = args.subject ?? "";
  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  let quotedHtml = "";

  if (args.reply) {
    const orig = await withImap(cfg, async (c) => {
      const path = await folderPath(c, args.reply!.folder);
      const lock = await c.getMailboxLock(path, { readOnly: true });
      try {
        const m = await c.fetchOne(String(args.reply!.uid), { source: true }, { uid: true });
        return m && m.source ? simpleParser(m.source) : null;
      } finally {
        lock.release();
      }
    });
    if (!orig) throw new Error("Mensagem original não encontrada para responder.");
    inReplyTo = orig.messageId;
    const prevRefs = Array.isArray(orig.references) ? orig.references : orig.references ? [orig.references] : [];
    references = [...prevRefs, ...(orig.messageId ? [orig.messageId] : [])];
    if (!subject) subject = /^(re|res):/i.test(orig.subject ?? "") ? orig.subject ?? "" : `Re: ${orig.subject ?? ""}`;
    const origHtml = orig.html || `<pre>${esc(orig.text ?? "")}</pre>`;
    quotedHtml = `<br><div style="border-left:2px solid #ccc;padding-left:8px;color:#555">
<b>De:</b> ${esc(orig.from?.text ?? "")}<br><b>Enviada em:</b> ${esc(fmtDate(orig.date))}<br><b>Assunto:</b> ${esc(orig.subject ?? "")}<br><br>${origHtml}</div>`;
  }
  if (!subject) throw new Error("Assunto obrigatório.");

  const html = `<div style="font-family:Verdana,Arial,sans-serif;font-size:13px">${linkify(esc(args.text)).replace(/\n/g, "<br>")}</div>${SIGNATURE_HTML}${quotedHtml}`;
  const mail = {
    from: cfg.from,
    to: args.to,
    cc: args.cc,
    subject,
    text: args.text,
    html,
    inReplyTo,
    references,
  };

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
  });
  const info = await transport.sendMail(mail);

  // Cópia em Enviados para aparecer no Zoho como qualquer outro e-mail.
  let saved = "cópia em Enviados: ok";
  try {
    const raw = await new MailComposer({ ...mail, messageId: info.messageId }).compile().build();
    await withImap(cfg, async (c) => {
      const path = await folderPath(c, "sent");
      await c.append(path, raw, ["\\Seen"]);
    });
  } catch (e) {
    saved = "cópia em Enviados falhou: " + (e instanceof Error ? e.message : String(e));
  }
  return `Enviado para ${args.to.join(", ")}${args.cc?.length ? " (cc " + args.cc.join(", ") + ")" : ""} | ${subject} | ${saved}`;
}
