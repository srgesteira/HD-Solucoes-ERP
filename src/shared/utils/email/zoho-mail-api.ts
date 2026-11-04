/**
 * Envio de e-mail pela API REST do Zoho Mail (OAuth2 com refresh token).
 *
 * Variáveis de ambiente (ver docs/ZOHO-SETUP.md):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_FROM_ADDRESS (obrigatórias)
 *   ZOHO_ACCOUNT_ID       (opcional — se ausente, descobre via GET /api/accounts)
 *   ZOHO_ACCOUNTS_DOMAIN  (padrão https://accounts.zoho.com)
 *   ZOHO_MAIL_DOMAIN      (padrão https://mail.zoho.com)
 *
 * Só usar no servidor (segredos).
 */

export type ZohoMailApiConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountId: string | null;
  fromAddress: string;
  accountsDomain: string;
  mailDomain: string;
};

export type ZohoAttachmentRef = {
  storeName: string;
  attachmentPath: string;
  attachmentName: string;
};

export type ZohoSendArgs = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string }[];
};

export type ZohoSendResult = {
  sent: true;
  provider: "zoho_api";
  messageId: string | null;
  message: string;
};

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Lê a configuração do ambiente; null quando faltam variáveis obrigatórias. */
export function zohoMailApiConfigFromEnv(): ZohoMailApiConfig | null {
  const clientId = process.env.ZOHO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN?.trim() ?? "";
  const fromAddress = process.env.ZOHO_FROM_ADDRESS?.trim() ?? "";
  if (!clientId || !clientSecret || !refreshToken || !fromAddress) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    fromAddress,
    accountId: process.env.ZOHO_ACCOUNT_ID?.trim() || null,
    accountsDomain: stripSlash(
      process.env.ZOHO_ACCOUNTS_DOMAIN?.trim() || "https://accounts.zoho.com"
    ),
    mailDomain: stripSlash(process.env.ZOHO_MAIL_DOMAIN?.trim() || "https://mail.zoho.com"),
  };
}

export function isZohoMailApiConfigured(): boolean {
  return zohoMailApiConfigFromEnv() !== null;
}

/* ---------- cache em memória (por instância serverless) ---------- */

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;
let accountCache: { key: string; accountId: string } | null = null;

function cacheKey(cfg: ZohoMailApiConfig): string {
  return `${cfg.accountsDomain}|${cfg.clientId}|${cfg.refreshToken.slice(-8)}`;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const txt = await res.text().catch(() => "");
  if (!txt) return {};
  try {
    const parsed = JSON.parse(txt) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { raw: txt.slice(0, 500) };
  }
}

function zohoErrorText(json: Record<string, unknown>, status: number): string {
  const data = json.data as Record<string, unknown> | undefined;
  const st = json.status as Record<string, unknown> | undefined;
  const parts = [
    typeof json.error === "string" ? json.error : null,
    typeof data?.errorCode === "string" ? data.errorCode : null,
    typeof data?.moreInfo === "string" ? data.moreInfo : null,
    typeof st?.description === "string" ? st.description : null,
    typeof json.raw === "string" ? json.raw : null,
  ].filter(Boolean);
  return `HTTP ${status}${parts.length ? ` — ${parts.join(" / ")}` : ""}`;
}

/** Access token a partir do refresh token, em cache até 1 min antes de expirar. */
export async function getZohoAccessToken(
  cfg: ZohoMailApiConfig,
  opts: { forceRefresh?: boolean } = {}
): Promise<string> {
  const key = cacheKey(cfg);
  if (
    !opts.forceRefresh &&
    tokenCache &&
    tokenCache.key === key &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.token;
  }
  const params = new URLSearchParams({
    refresh_token: cfg.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${cfg.accountsDomain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const json = await readJson(res);
  const token = typeof json.access_token === "string" ? json.access_token : "";
  if (!res.ok || !token) {
    tokenCache = null;
    throw new Error(
      `Zoho: falha ao obter access token (${zohoErrorText(json, res.status)}). Verifique ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN e ZOHO_ACCOUNTS_DOMAIN.`
    );
  }
  const expiresIn = Number(json.expires_in ?? 3600);
  tokenCache = {
    key,
    token,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
  };
  return token;
}

async function zohoFetch(
  cfg: ZohoMailApiConfig,
  path: string,
  init: RequestInit
): Promise<{ res: Response; json: Record<string, unknown> }> {
  const doFetch = async (token: string) =>
    fetch(`${cfg.mailDomain}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Zoho-oauthtoken ${token}`,
      },
    });
  let res = await doFetch(await getZohoAccessToken(cfg));
  if (res.status === 401) {
    // token revogado/expirado antes do previsto: renova uma vez.
    res = await doFetch(await getZohoAccessToken(cfg, { forceRefresh: true }));
  }
  return { res, json: await readJson(res) };
}

/** accountId: env ZOHO_ACCOUNT_ID ou descoberto via GET /api/accounts (conta do remetente). */
export async function resolveZohoAccountId(cfg: ZohoMailApiConfig): Promise<string> {
  if (cfg.accountId) return cfg.accountId;
  const key = cacheKey(cfg) + "|" + cfg.fromAddress.toLowerCase();
  if (accountCache?.key === key) return accountCache.accountId;

  const { res, json } = await zohoFetch(cfg, "/api/accounts", { method: "GET" });
  if (!res.ok) {
    throw new Error(`Zoho: falha ao listar contas (${zohoErrorText(json, res.status)}).`);
  }
  const accounts = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];
  const from = cfg.fromAddress.toLowerCase();
  const addressesOf = (a: Record<string, unknown>): string[] => {
    const out: string[] = [];
    if (typeof a.primaryEmailAddress === "string") out.push(a.primaryEmailAddress);
    if (typeof a.mailboxAddress === "string") out.push(a.mailboxAddress);
    for (const list of [a.emailAddress, a.sendMailDetails]) {
      if (!Array.isArray(list)) continue;
      for (const e of list as Record<string, unknown>[]) {
        if (typeof e?.mailId === "string") out.push(e.mailId);
        if (typeof e?.fromAddress === "string") out.push(e.fromAddress);
      }
    }
    return out.map((s) => s.toLowerCase());
  };
  const match = accounts.find((a) => addressesOf(a).includes(from)) ?? accounts[0];
  const accountId = match?.accountId != null ? String(match.accountId) : "";
  if (!accountId) {
    throw new Error("Zoho: nenhuma conta de e-mail encontrada para este token.");
  }
  accountCache = { key, accountId };
  return accountId;
}

async function uploadAttachment(
  cfg: ZohoMailApiConfig,
  accountId: string,
  file: { filename: string; content: Buffer | Uint8Array; contentType?: string }
): Promise<ZohoAttachmentRef> {
  const form = new FormData();
  const bytes = new Uint8Array(file.content);
  form.append(
    "attach",
    new Blob([bytes], { type: file.contentType || "application/octet-stream" }),
    file.filename
  );
  const qs = new URLSearchParams({ uploadType: "multipart", fileName: file.filename });
  const { res, json } = await zohoFetch(
    cfg,
    `/api/accounts/${encodeURIComponent(accountId)}/messages/attachments?${qs.toString()}`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    throw new Error(
      `Zoho: falha ao enviar anexo ${file.filename} (${zohoErrorText(json, res.status)}).`
    );
  }
  // multipart → data é array; upload simples → objeto.
  const raw = Array.isArray(json.data) ? json.data[0] : json.data;
  const d = (raw ?? {}) as Record<string, unknown>;
  if (!d.storeName || !d.attachmentPath) {
    throw new Error(`Zoho: resposta inesperada ao enviar anexo ${file.filename}.`);
  }
  return {
    storeName: String(d.storeName),
    attachmentPath: String(d.attachmentPath),
    attachmentName: String(d.attachmentName ?? file.filename),
  };
}

function dedupe(list: string[] | undefined): string[] {
  return [...new Set((list ?? []).map((e) => e.trim()).filter(Boolean))];
}

/** Envia um e-mail HTML (com anexos) pela API do Zoho Mail. Lança erro se falhar. */
export async function sendViaZohoMailApi(
  args: ZohoSendArgs,
  cfgArg?: ZohoMailApiConfig | null
): Promise<ZohoSendResult> {
  const cfg = cfgArg ?? zohoMailApiConfigFromEnv();
  if (!cfg) throw new Error("Zoho não configurado.");
  const to = dedupe(args.to);
  const cc = dedupe(args.cc).filter((e) => !to.includes(e));
  if (to.length === 0) throw new Error("Indique pelo menos um destinatário.");

  const accountId = await resolveZohoAccountId(cfg);
  const attachments: ZohoAttachmentRef[] = [];
  for (const file of args.attachments ?? []) {
    attachments.push(await uploadAttachment(cfg, accountId, file));
  }

  const payload: Record<string, unknown> = {
    fromAddress: cfg.fromAddress,
    toAddress: to.join(","),
    subject: args.subject,
    content: args.html,
    mailFormat: "html",
    encoding: "UTF-8",
  };
  if (cc.length) payload.ccAddress = cc.join(",");
  if (attachments.length) payload.attachments = attachments;

  const { res, json } = await zohoFetch(
    cfg,
    `/api/accounts/${encodeURIComponent(accountId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const statusCode = Number((json.status as Record<string, unknown> | undefined)?.code ?? res.status);
  if (!res.ok || (Number.isFinite(statusCode) && statusCode >= 400)) {
    throw new Error(`Zoho: falha ao enviar e-mail (${zohoErrorText(json, res.status)}).`);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  return {
    sent: true,
    provider: "zoho_api",
    messageId: data.messageId != null ? String(data.messageId) : null,
    message: `E-mail enviado (Zoho Mail) para ${to.join(", ")}${cc.length ? ` (cc: ${cc.join(", ")})` : ""}.`,
  };
}
