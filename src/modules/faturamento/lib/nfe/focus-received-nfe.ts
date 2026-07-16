/**
 * Cliente Focus — NF-e recebidas (MDe / nfes_recebidas).
 * @see https://doc.focusnfe.com.br/reference/consultar_nfes_recebidas
 */

import axios from "axios";
import type { FocusNFeEnv } from "@/modules/faturamento/lib/nfe/focusnfe.service";
import { focusNFeBaseUrl } from "@/modules/faturamento/lib/nfe/focusnfe.service";

function basicAuthHeader(token: string): string {
  const raw = `${token.trim()}:`;
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(raw);
  return `Basic ${b64}`;
}

export type FocusReceivedNfeSummary = {
  chave_nfe?: string;
  chave?: string;
  nome_emitente?: string;
  documento_emitente?: string;
  cnpj_emitente?: string;
  data_emissao?: string;
  valor_total?: number;
  versao?: number;
  situacao?: string;
  [key: string]: unknown;
};

export class FocusMdeNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FocusMdeNotAvailableError";
  }
}

function isMdeUnavailable(status: number, data: unknown): boolean {
  if (status === 403 || status === 402) return true;
  if (status === 404) return true;
  const msg =
    data && typeof data === "object"
      ? String(
          (data as Record<string, unknown>).mensagem ??
            (data as Record<string, unknown>).message ??
            (data as Record<string, unknown>).erro ??
            ""
        ).toLowerCase()
      : "";
  return (
    msg.includes("mde") ||
    msg.includes("manifest") ||
    msg.includes("não contrat") ||
    msg.includes("nao contrat") ||
    msg.includes("não habilit") ||
    msg.includes("nao habilit") ||
    msg.includes("produto")
  );
}

export async function listNfesRecebidasHttp(args: {
  token: string;
  env: FocusNFeEnv;
  cnpj: string;
  versao?: number | null;
}): Promise<{
  ok: boolean;
  status: number;
  data: FocusReceivedNfeSummary[];
  raw: unknown;
}> {
  const client = axios.create({
    baseURL: focusNFeBaseUrl(args.env),
    headers: {
      Authorization: basicAuthHeader(args.token),
      Accept: "application/json",
    },
    validateStatus: () => true,
  });

  const params: Record<string, string | number> = {
    cnpj: args.cnpj.replace(/\D/g, ""),
  };
  if (args.versao != null && Number.isFinite(args.versao)) {
    params.versao = args.versao;
  }

  const res = await client.get("/nfes_recebidas", { params });
  if (isMdeUnavailable(res.status, res.data)) {
    throw new FocusMdeNotAvailableError(
      "Conta Focus sem produto MDe / NF-e recebidas. Código pronto; activação depende do contrato Focus da HD."
    );
  }

  const list = Array.isArray(res.data)
    ? (res.data as FocusReceivedNfeSummary[])
    : Array.isArray((res.data as { data?: unknown })?.data)
      ? ((res.data as { data: FocusReceivedNfeSummary[] }).data)
      : [];

  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    data: list,
    raw: res.data,
  };
}

export async function getNfeRecebidaXmlHttp(args: {
  token: string;
  env: FocusNFeEnv;
  chave: string;
}): Promise<{ ok: boolean; status: number; xml: string | null }> {
  const client = axios.create({
    baseURL: focusNFeBaseUrl(args.env),
    headers: {
      Authorization: basicAuthHeader(args.token),
      Accept: "application/xml, application/json, text/xml, */*",
    },
    validateStatus: () => true,
    responseType: "text",
  });

  const res = await client.get(
    `/nfes_recebidas/${encodeURIComponent(args.chave)}.xml`
  );
  if (isMdeUnavailable(res.status, res.data)) {
    throw new FocusMdeNotAvailableError(
      "Conta Focus sem produto MDe / NF-e recebidas."
    );
  }
  const xml = typeof res.data === "string" ? res.data : null;
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    xml,
  };
}

export async function manifestarNfeRecebidaHttp(args: {
  token: string;
  env: FocusNFeEnv;
  chave: string;
  tipo: "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada";
  justificativa?: string;
}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const client = axios.create({
    baseURL: focusNFeBaseUrl(args.env),
    headers: {
      Authorization: basicAuthHeader(args.token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    validateStatus: () => true,
  });

  const body: Record<string, string> = { tipo: args.tipo };
  if (args.justificativa) body.justificativa = args.justificativa;

  const res = await client.post(
    `/nfes_recebidas/${encodeURIComponent(args.chave)}/manifesto`,
    body
  );
  if (isMdeUnavailable(res.status, res.data)) {
    throw new FocusMdeNotAvailableError(
      "Conta Focus sem produto MDe / NF-e recebidas."
    );
  }
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    data: res.data,
  };
}
