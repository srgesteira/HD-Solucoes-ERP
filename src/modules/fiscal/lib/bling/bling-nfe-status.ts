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
  const xmlRaw = str(data.xml);
  const xmlUrl =
    xmlLink ??
    (xmlRaw && /^https?:\/\//i.test(xmlRaw) ? xmlRaw : null);
  const xmlBody =
    xmlRaw && xmlRaw.includes("<") && !/^https?:\/\//i.test(xmlRaw)
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
    if (k === "xml" || k === "observacoes" || k === "itens" || k === "parcelas") {
      continue;
    }
    if (typeof v === "string" && v.trim() && v.length < 280) {
      bits.push(`${k}: ${v.trim()}`);
    }
    if (bits.length >= 10) break;
  }
  return bits.join(" | ");
}

export async function enrichRejectedSnapshot(
  snapshot: BlingNfeSnapshot,
  payload?: unknown
): Promise<BlingNfeSnapshot> {
  if (snapshot.status !== "rejected" && snapshot.status !== "error") {
    return snapshot;
  }
  if (snapshot.error_message) return snapshot;
  const fromPayload = payload ? findRejeicaoDeep(payload) : null;
  if (fromPayload) return { ...snapshot, error_message: fromPayload };
  const url = snapshot.xml_url;
  if (!url || !/^https?:\/\//i.test(url)) {
    const data = unwrapBlingData(payload);
    const summary = data ? summarizeBlingNfeForError(data) : "";
    return {
      ...snapshot,
      error_message: summary
        ? `NF-e rejeitada pela SEFAZ. ${summary}`
        : snapshot.error_message,
    };
  }
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/xml,text/xml,*/*" },
    });
    const text = await res.text();
    const motivo = xMotivoFromXml(text) ?? findRejeicaoDeep(text);
    if (motivo) return { ...snapshot, error_message: motivo };
  } catch {
    // XML público pode exigir sessão Bling.
  }
  const data = unwrapBlingData(payload);
  const summary = data ? summarizeBlingNfeForError(data) : "";
  return {
    ...snapshot,
    error_message: summary
      ? `NF-e rejeitada pela SEFAZ. ${summary}`
      : snapshot.error_message,
  };
}
