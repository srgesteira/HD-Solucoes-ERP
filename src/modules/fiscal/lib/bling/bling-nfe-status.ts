/**
 * Situação da NF-e na API v3 do Bling (campo `situacao`).
 * Valores alinhados à referência de Notas Fiscais Eletrônicas.
 */
export const BLING_NFE_SITUACAO = {
  PENDENTE: 1,
  CANCELADA: 2,
  AGUARDANDO_RECIBO: 3,
  REJEITADA: 4,
  AUTORIZADA: 5,
  EMITIDA_DANFE: 6,
  REGISTRADA: 7,
  DENEGADA: 8,
} as const;

export type NfeDbStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancelled"
  | "error";

export function mapBlingSituacaoToDb(situacao: unknown): NfeDbStatus {
  const n = Number(situacao);
  switch (n) {
    case BLING_NFE_SITUACAO.AUTORIZADA:
    case BLING_NFE_SITUACAO.EMITIDA_DANFE:
    case BLING_NFE_SITUACAO.REGISTRADA:
      return "authorized";
    case BLING_NFE_SITUACAO.CANCELADA:
      return "cancelled";
    case BLING_NFE_SITUACAO.REJEITADA:
    case BLING_NFE_SITUACAO.DENEGADA:
      return "rejected";
    case BLING_NFE_SITUACAO.PENDENTE:
      return "pending";
    case BLING_NFE_SITUACAO.AGUARDANDO_RECIBO:
      return "processing";
    default:
      return "processing";
  }
}

export function nfeDbStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "processing":
      return "Processando";
    case "authorized":
      return "Autorizada";
    case "rejected":
      return "Rejeitada";
    case "cancelled":
      return "Cancelada";
    case "error":
      return "Erro";
    default:
      return status ? String(status) : "—";
  }
}

export type BlingNfeSnapshot = {
  bling_nfe_id: number | null;
  situacao: number | null;
  status: NfeDbStatus;
  nfe_number: string | null;
  nfe_key: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  error_message: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function xmlFieldToString(xml: unknown): string | null {
  if (typeof xml === "string" && xml.trim()) return xml.trim();
  if (xml && typeof xml === "object" && !Array.isArray(xml)) {
    const o = xml as Record<string, unknown>;
    return (
      str(o.url) ??
      str(o.link) ??
      str(o.href) ??
      str(o.content) ??
      str(o.xml)
    );
  }
  return null;
}

function isHttpUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function looksLikeXml(text: string): boolean {
  return (
    text.includes("<cStat") ||
    text.includes("<xMotivo") ||
    text.includes("<NFe") ||
    text.includes("<nfeProc") ||
    text.includes("<enviNFe") ||
    text.includes("<protNFe") ||
    text.includes("<infNFe")
  );
}

function xmlTag(xml: string, name: string): string | null {
  const m = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>\\s*([^<]*)\\s*</${name}>`, "i")
  );
  return m?.[1]?.replace(/\s+/g, " ").trim() || null;
}

/** Diagnóstico do XML enviado quando o Bling não devolve xMotivo da SEFAZ. */
export function diagnoseNfeXml(xml: string): string | null {
  if (!looksLikeXml(xml)) return null;
  const bits: string[] = [];
  const crt = xmlTag(xml, "CRT");
  const csosn = [
    ...xml.matchAll(/<CSOSN>\s*(\d+)\s*<\/CSOSN>/gi),
  ].map((m) => m[1]);
  const nNF = xmlTag(xml, "nNF");
  const serie = xmlTag(xml, "serie");
  const vNF = xmlTag(xml, "vNF");
  const vProd = xmlTag(xml, "vProd");
  const vDesc = xmlTag(xml, "vDesc");
  const vFrete = xmlTag(xml, "vFrete");
  const indIEDest = xmlTag(xml, "indIEDest");
  const destIE = xml.match(/<dest>[\s\S]*?<IE>([^<]*)<\/IE>/i)?.[1]?.trim();
  const cMunDest = xml
    .match(/<enderDest>[\s\S]*?<cMun>([^<]*)<\/cMun>/i)?.[1]
    ?.trim();
  const nDet = (xml.match(/<det[\s>]/g) ?? []).length;
  const natOp = xmlTag(xml, "natOp");
  if (crt === "1" && csosn.length === 0) {
    bits.push("provável 590: CST no Simples (falta CSOSN)");
  }
  if (nNF) bits.push(`nNF=${nNF}`);
  if (serie) bits.push(`serie=${serie}`);
  if (crt) bits.push(`CRT=${crt}`);
  if (csosn.length) bits.push(`CSOSN=${[...new Set(csosn)].join(",")}`);
  else bits.push("sem CSOSN");
  if (indIEDest) bits.push(`indIEDest=${indIEDest}`);
  if (destIE) bits.push(`IE dest=${destIE}`);
  if (cMunDest) bits.push(`cMun dest=${cMunDest}`);
  if (vNF) bits.push(`vNF=${vNF}`);
  if (vProd) bits.push(`vProd=${vProd}`);
  if (vDesc && Number(vDesc) !== 0) bits.push(`vDesc=${vDesc}`);
  if (vFrete && Number(vFrete) !== 0) bits.push(`vFrete=${vFrete}`);
  bits.push(`${nDet} item(ns)`);
  if (natOp) bits.push(`natOp=${natOp.slice(0, 40)}`);
  return bits.join("; ");
}

function extractXmlFromFetched(text: string): string {
  const t = text.trim();
  if (looksLikeXml(t)) return t;
  try {
    const j = JSON.parse(t) as unknown;
    if (typeof j === "string") return j;
    if (j && typeof j === "object") {
      const o = j as Record<string, unknown>;
      if (typeof o.xml === "string") return o.xml;
      if (typeof o.data === "string") return o.data;
      if (o.data && typeof o.data === "object") {
        const d = o.data as Record<string, unknown>;
        if (typeof d.xml === "string") return d.xml;
      }
    }
  } catch {
    // HTML DANFE ou texto livre.
  }
  return t;
}

function xmlUrlsFromNfe(
  data: Record<string, unknown> | null,
  snapshot: BlingNfeSnapshot
): string[] {
  const urls: string[] = [];
  const push = (v: string | null | undefined) => {
    if (v && isHttpUrl(v) && !urls.includes(v)) urls.push(v);
  };
  push(snapshot.xml_url);
  const xmlRaw = data ? xmlFieldToString(data.xml) : null;
  push(xmlRaw);
  push(str(data?.linkXML) ?? str(data?.linkXml));
  const pdf = snapshot.pdf_url;
  if (pdf && /doc\.view\.php/i.test(pdf)) {
    if (/PDF=true/i.test(pdf)) {
      push(pdf.replace(/PDF=true/i, "XML=true"));
    } else {
      push(`${pdf}${pdf.includes("?") ? "&" : "?"}XML=true`);
    }
  }
  return urls;
}

function xMotivoFromXml(xml: string): string | null {
  const pairs = [
    ...xml.matchAll(
      /<cStat>\s*(\d+)\s*<\/cStat>[\s\S]{0,400}?<xMotivo>\s*([^<]+)\s*<\/xMotivo>/gi
    ),
  ];
  for (const m of pairs) {
    const code = m[1];
    const reason = m[2]?.replace(/\s+/g, " ").trim();
    if (!reason) continue;
    if (code === "100" || code === "150") continue;
    if (code === "103" || code === "104" || code === "105") continue;
    return `${code} - ${reason}`;
  }
  const only = xml.match(/<xMotivo>\s*([^<]+)\s*<\/xMotivo>/i);
  const reason = only?.[1]?.replace(/\s+/g, " ").trim();
  return reason || null;
}

function looksLikeComplementaryInfo(text: string): boolean {
  return /Pedido HD|HD-ERP:|infCpl/i.test(text);
}

function firstMessage(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() && !looksLikeComplementaryInfo(v)) {
      return v.trim();
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const nested = firstMessage([
        o.motivo,
        o.mensagem,
        o.descricao,
        o.message,
        o.xMotivo,
        o.mensagemSefaz,
      ]);
      if (nested) return nested;
    }
  }
  return null;
}

function findRejeicaoDeep(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || looksLikeComplementaryInfo(text)) return null;
    if (text.includes("<cStat") || text.includes("<xMotivo")) {
      return xMotivoFromXml(text);
    }
    if (
      text.length < 400 &&
      /rejei[cç][aã]o|\bSEFAZ\b|\bcStat\b|\bxMotivo\b/i.test(text)
    ) {
      return text.replace(/\s+/g, " ");
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRejeicaoDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findRejeicaoDeep(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractBlingNfeRejeicao(data: Record<string, unknown>): string | null {
  const fromArrays = Array.isArray(data.erros)
    ? firstMessage(data.erros)
    : null;
  return (
    firstMessage([
      data.motivo,
      data.mensagem,
      data.motivoStatus,
      data.situacaoDescricao,
      data.descricaoSituacao,
      data.mensagemSefaz,
      data.xMotivo,
      data.sefaz,
      data.retorno,
      data.retornoSefaz,
      data.autorizacao,
      fromArrays,
    ]) ?? findRejeicaoDeep(data)
  );
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Extrai o envelope `{ data }` da API v3. */
export function unwrapBlingData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    return o.data as Record<string, unknown>;
  }
  return o;
}

export function unwrapBlingList(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  if (Array.isArray(o.data)) {
    return o.data.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row)
    );
  }
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row)
    );
  }
  return [];
}

export function parseBlingNfeSnapshot(
  payload: unknown,
  fallbackId?: number | null
): BlingNfeSnapshot {
  const data = unwrapBlingData(payload) ?? {};
  const situacao = num(data.situacao);
  const id = num(data.id) ?? fallbackId ?? null;
  const chave =
    str(data.chaveAcesso) ??
    str(data.chave) ??
    str(data.chave_acesso);
  const xmlLink =
    str(data.linkXML) ??
    str(data.linkXml) ??
    str(data.xmlUrl);
  const xmlRaw = xmlFieldToString(data.xml);
  const xmlUrl =
    xmlLink ??
    (xmlRaw && isHttpUrl(xmlRaw) ? xmlRaw : null);
  const xmlBody =
    xmlRaw && looksLikeXml(xmlRaw) && !isHttpUrl(xmlRaw)
      ? xmlRaw
      : null;
  const pdf =
    str(data.linkDanfe) ??
    str(data.linkDANFE) ??
    str(data.danfe) ??
    str(data.pdf) ??
    str(data.linkPdf);
  const numero = data.numero;
  const nfeNumber =
    typeof numero === "number"
      ? String(numero)
      : str(numero);

  const status = mapBlingSituacaoToDb(situacao);
  const rejeicao =
    extractBlingNfeRejeicao(data) ??
    (xmlBody ? xMotivoFromXml(xmlBody) : null);

  return {
    bling_nfe_id: id,
    situacao,
    status,
    nfe_number: nfeNumber,
    nfe_key: chave,
    xml_url: xmlUrl,
    pdf_url: pdf,
    error_message:
      status === "rejected" || status === "error"
        ? rejeicao
        : null,
  };
}

export function summarizeBlingNfeForError(
  data: Record<string, unknown>
): string {
  const keys = Object.keys(data).slice(0, 30).join(", ");
  const bits: string[] = [];
  if (data.situacao != null) bits.push(`situacao=${String(data.situacao)}`);
  if (keys) bits.push(`campos=${keys}`);
  for (const [k, v] of Object.entries(data)) {
    if (k === "observacoes" || k === "itens" || k === "parcelas") {
      continue;
    }
    if (k === "xml") {
      const xmlRaw = xmlFieldToString(v);
      if (xmlRaw && isHttpUrl(xmlRaw)) {
        bits.push(`xml: ${xmlRaw.slice(0, 90)}`);
      } else if (xmlRaw && looksLikeXml(xmlRaw)) {
        bits.push(`xml: ${xmlRaw.length} chars`);
      }
      continue;
    }
    if (typeof v === "boolean" || typeof v === "number") {
      bits.push(`${k}: ${String(v)}`);
    } else if (typeof v === "string" && v.trim() && v.length < 280) {
      bits.push(`${k}: ${v.trim()}`);
    }
    if (bits.length >= 14) break;
  }
  return bits.join(" | ");
}

async function motivoFromXmlText(text: string): Promise<string | null> {
  const xml = extractXmlFromFetched(text);
  return (
    xMotivoFromXml(xml) ??
    findRejeicaoDeep(xml) ??
    (diagnoseNfeXml(xml)
      ? `NF-e rejeitada pela SEFAZ. XML: ${diagnoseNfeXml(xml)}`
      : null)
  );
}

export async function enrichRejectedSnapshot(
  snapshot: BlingNfeSnapshot,
  payload?: unknown,
  fetchXml?: (url: string) => Promise<string>
): Promise<BlingNfeSnapshot> {
  if (snapshot.status !== "rejected" && snapshot.status !== "error") {
    return snapshot;
  }
  const generic =
    !snapshot.error_message ||
    snapshot.error_message.startsWith("NF-e rejeitada pela SEFAZ.");
  if (snapshot.error_message && !generic) return snapshot;

  const fromPayload = payload ? findRejeicaoDeep(payload) : null;
  if (fromPayload) return { ...snapshot, error_message: fromPayload };

  const data = unwrapBlingData(payload);
  const xmlRaw = data ? xmlFieldToString(data.xml) : null;
  if (xmlRaw && looksLikeXml(xmlRaw) && !isHttpUrl(xmlRaw)) {
    const fromBody = await motivoFromXmlText(xmlRaw);
    if (fromBody) return { ...snapshot, error_message: fromBody };
  }

  const urls = xmlUrlsFromNfe(data, snapshot);
  for (const url of urls) {
    if (fetchXml) {
      try {
        const fromAuth = await motivoFromXmlText(await fetchXml(url));
        if (fromAuth) return { ...snapshot, error_message: fromAuth };
      } catch {
        // Link autenticado pode recusar; tenta GET público abaixo.
      }
    }
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml,text/xml,*/*" },
      });
      const fromPublic = await motivoFromXmlText(await res.text());
      if (fromPublic) return { ...snapshot, error_message: fromPublic };
    } catch {
      // XML público pode exigir sessão Bling.
    }
  }

  const summary = data ? summarizeBlingNfeForError(data) : "";
  return {
    ...snapshot,
    error_message: summary
      ? `NF-e rejeitada pela SEFAZ. ${summary}`
      : snapshot.error_message,
  };
}
