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
  const xml =
    str(data.xml) ??
    str(data.linkXML) ??
    str(data.linkXml) ??
    str(data.xmlUrl);
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
    str(data.motivo) ??
    str(data.mensagem) ??
    str(data.observacoes);

  return {
    bling_nfe_id: id,
    situacao,
    status,
    nfe_number: nfeNumber,
    nfe_key: chave,
    xml_url: xml,
    pdf_url: pdf,
    error_message:
      status === "rejected" || status === "error"
        ? rejeicao
        : null,
  };
}
