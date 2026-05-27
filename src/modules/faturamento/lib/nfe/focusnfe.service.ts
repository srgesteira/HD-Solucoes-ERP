/**
 * Cliente FocusNFe v2 (NFS-e municipal) com axios.
 * @see https://doc.focusnfe.com.br/reference/emitir_nfse
 * Autenticação: Basic com token como utilizador e senha vazia.
 */

import axios, { type AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

export type FocusNFeEnv = "homologacao" | "producao";

type Admin = SupabaseClient<Database>;

export function focusNFeBaseUrl(env: FocusNFeEnv): string {
  return env === "producao"
    ? "https://api.focusnfe.com.br/v2"
    : "https://homologacao.focusnfe.com.br/v2";
}

function basicAuthHeader(token: string): string {
  const raw = `${token.trim()}:`;
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(raw);
  return `Basic ${b64}`;
}

function createClient(token: string, env: FocusNFeEnv): AxiosInstance {
  return axios.create({
    baseURL: focusNFeBaseUrl(env),
    headers: {
      Authorization: basicAuthHeader(token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    validateStatus: () => true,
  });
}

/** Referência enviada à Focus (única por emissão). */
export function focusRefFromNfeId(nfeId: string): string {
  return nfeId.replace(/-/g, "");
}

export async function emitirNFSeHttp(
  token: string,
  env: FocusNFeEnv,
  ref: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const client = createClient(token, env);
  const res = await client.post(`/nfse?ref=${encodeURIComponent(ref)}`, body);
  const data =
    typeof res.data === "object" && res.data !== null
      ? res.data
      : { raw: res.data };
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
}

export async function consultarNFSeHttp(
  token: string,
  env: FocusNFeEnv,
  ref: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const client = createClient(token, env);
  const res = await client.get(`/nfse/${encodeURIComponent(ref)}`);
  const data =
    typeof res.data === "object" && res.data !== null
      ? res.data
      : { raw: res.data };
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
}

export async function cancelarNFSeHttp(
  token: string,
  env: FocusNFeEnv,
  ref: string,
  justificativa: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const client = createClient(token, env);
  const res = await client.delete(`/nfse/${encodeURIComponent(ref)}`, {
    data: { justificativa },
  });
  const data =
    typeof res.data === "object" && res.data !== null
      ? res.data
      : { raw: res.data };
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
}

export type NfseMappedFields = {
  apiStatus: string;
  nfe_number: string | null;
  nfe_key: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  error_message: string | null;
};

/** Mapeia resposta Focus (varia por município) para campos da tabela `nfes`. */
export function mapFocusNfseResponse(data: unknown): NfseMappedFields {
  if (!data || typeof data !== "object") {
    return {
      apiStatus: "error",
      nfe_number: null,
      nfe_key: null,
      xml_url: null,
      pdf_url: null,
      error_message: "Resposta inválida da API.",
    };
  }
  const o = data as Record<string, unknown>;
  const apiStatus =
    typeof o.status === "string"
      ? o.status
      : typeof o.situacao === "string"
        ? o.situacao
        : "pending";

  const nfe_key =
    typeof o.codigo_verificacao === "string"
      ? o.codigo_verificacao
      : typeof o.chave_acesso === "string"
        ? o.chave_acesso
        : typeof o.chave_nfse === "string"
          ? o.chave_nfse
          : null;

  const nfe_number =
    typeof o.numero === "string"
      ? o.numero
      : typeof o.numero === "number"
        ? String(o.numero)
        : typeof o.numero_nfse === "string"
          ? o.numero_nfse
          : typeof o.numero_nfse === "number"
            ? String(o.numero_nfse)
            : null;

  const xml_url =
    typeof o.url_xml === "string"
      ? o.url_xml
      : typeof o.caminho_xml === "string"
        ? o.caminho_xml
        : typeof o.xml === "string"
          ? o.xml
          : null;

  const pdf_url =
    typeof o.url_danfse === "string"
      ? o.url_danfse
      : typeof o.url_danfe === "string"
        ? o.url_danfe
        : typeof o.url === "string"
          ? o.url
          : null;

  const err =
    typeof o.mensagem === "string"
      ? o.mensagem
      : typeof o.mensagem_sefaz === "string"
        ? o.mensagem_sefaz
        : typeof o.erros === "string"
          ? o.erros
          : null;

  return {
    apiStatus,
    nfe_number,
    nfe_key,
    xml_url,
    pdf_url,
    error_message: err,
  };
}

export type NfeDbStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "cancelled"
  | "error";

export function mapApiStatusToDb(
  apiStatus: string,
  httpOk: boolean
): NfeDbStatus {
  if (!httpOk) return "error";
  const s = apiStatus.toLowerCase();
  if (s.includes("autoriz") || s === "autorizado") return "authorized";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("process") || s === "processando") return "processing";
  if (s.includes("erro") || s.includes("reprov") || s.includes("deneg")) {
    return "error";
  }
  return "pending";
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function buildTomador(
  clientDocument: string | null,
  clientName: string
): Record<string, unknown> {
  const doc = onlyDigits(clientDocument ?? "");
  if (doc.length === 14) {
    return { cnpj: doc, razao_social: clientName };
  }
  if (doc.length === 11) {
    return { cpf: doc, razao_social: clientName };
  }
  return { razao_social: clientName };
}

/** Extrai CEP (8 dígitos) de texto livre de endereço. */
export function extractCepDigitsFromAddress(text: string | null): string | null {
  if (!text?.trim()) return null;
  const m = text.match(/\b(\d{5})[\s\-.]?(\d{3})\b/);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

function stripCepFromAddressLine(s: string): string {
  return s
    .replace(/\b\d{5}[\s\-.]?\d{3}\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

function buildTomadorEndereco(
  addressFree: string | null,
  ufHint: string | null
): Record<string, unknown> | null {
  const cep = extractCepDigitsFromAddress(addressFree);
  const cleaned = stripCepFromAddressLine(addressFree ?? "");
  if (!cep && !cleaned) return null;
  const uf = (ufHint ?? "SP").trim().toUpperCase().slice(0, 2) || "SP";
  return {
    logradouro:
      cleaned.length > 0 ?
        cleaned.slice(0, 125)
      : "Endereço conforme cadastro do pedido",
    numero: "S/N",
    complemento: "",
    bairro: "—",
    uf,
    ...(cep ? { cep } : {}),
  };
}

function buildTomadorSp(args: {
  clientName: string;
  clientDocument: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  companyAddressState: string | null;
}): Record<string, unknown> {
  const t = buildTomador(args.clientDocument, args.clientName);
  const email = args.clientEmail?.trim();
  if (email) {
    (t as Record<string, unknown>).email = email;
  }
  const tel = onlyDigits(args.clientPhone ?? "");
  if (tel.length >= 8) {
    (t as Record<string, unknown>).telefone = args.clientPhone?.trim() ?? tel;
  }
  const end = buildTomadorEndereco(
    args.clientAddress,
    args.companyAddressState
  );
  if (end) {
    (t as Record<string, unknown>).endereco = end;
  }
  return t;
}

export type NfsePayloadBuildInput = {
  orderDate: string;
  clientName: string;
  clientDocument: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  total: number;
  itemsDescription: string;
  companyCnpj: string | null;
  municipalRegistration: string | null;
  taxRegime: string | null;
  companyAddressState: string | null;
  nfse_item_lista_servico: string | null;
  nfse_iss_aliquota: number | null;
  nfse_prestador_codigo_municipio: string | null;
  nfse_codigo_nbs: string | null;
  nfse_codigo_indicador_operacao: string | null;
  nfse_ibs_cbs_classificacao_tributaria: string | null;
  nfse_use_sao_paulo_payload: boolean;
  nfse_codigo_tributario_municipio: string | null;
};

/**
 * Monta JSON da NFS-e para a API Focus (município genérico ou São Paulo conforme configuração).
 * @see https://focusnfe.com.br/guides/nfse/municipios-integrados/sao-paulo-sp/
 */
export function buildNfsePayloadFromSalesOrder(
  args: NfsePayloadBuildInput
): Record<string, unknown> {
  const cnpj = onlyDigits(args.companyCnpj ?? "");
  if (cnpj.length !== 14) {
    throw new Error("CNPJ da empresa inválido ou ausente (configurações).");
  }
  const im = (args.municipalRegistration ?? "").trim();
  if (!im) {
    throw new Error(
      "Inscrição municipal do prestador em falta (Empresa). A NFS-e municipal exige este dado."
    );
  }

  const totalNum = Number(args.total ?? 0);
  if (!Number.isFinite(totalNum) || totalNum < 0) {
    throw new Error("Total do pedido inválido para NFS-e.");
  }
  const valorStr = totalNum.toFixed(2);
  const data_emissao = `${args.orderDate.slice(0, 10)}T00:00:00`;

  if (args.nfse_use_sao_paulo_payload) {
    const itemLista = (args.nfse_item_lista_servico ?? "").trim();
    if (!itemLista) {
      throw new Error(
        "NFS-e São Paulo: preencha «Item lista de serviço» nas configurações da empresa (código da prefeitura, ex.: 07498)."
      );
    }
    const iss = args.nfse_iss_aliquota;
    if (iss == null || !Number.isFinite(iss) || iss < 0 || iss > 100) {
      throw new Error(
        "NFS-e São Paulo: indique a alíquota ISS (%) nas configurações da empresa."
      );
    }
    const cepTomador = extractCepDigitsFromAddress(args.clientAddress);
    if (!cepTomador) {
      throw new Error(
        "NFS-e São Paulo: inclua o CEP do cliente (8 dígitos) no endereço do pedido de venda."
      );
    }

    const codigoMun = onlyDigits(
      args.nfse_prestador_codigo_municipio ?? "3550308"
    );
    if (codigoMun.length !== 7) {
      throw new Error(
        "Código IBGE do município do prestador inválido (7 dígitos, ex.: 3550308 para São Paulo)."
      );
    }

    const nbs = (args.nfse_codigo_nbs ?? "000000000").trim();
    const indOp = (args.nfse_codigo_indicador_operacao ?? "000000").trim();
    const ibs = (args.nfse_ibs_cbs_classificacao_tributaria ?? "000001").trim();

    const tomador = buildTomadorSp({
      clientName: args.clientName,
      clientDocument: args.clientDocument,
      clientAddress: args.clientAddress,
      clientEmail: args.clientEmail,
      clientPhone: args.clientPhone,
      companyAddressState: args.companyAddressState,
    });

    return {
      data_emissao,
      natureza_operacao: "1",
      optante_simples_nacional: args.taxRegime === "simples_nacional",
      incentivador_cultural: false,
      prestador: {
        cnpj,
        inscricao_municipal: im,
        codigo_municipio: codigoMun,
      },
      tomador,
      servico: {
        discriminacao: args.itemsDescription.slice(0, 2000),
        item_lista_servico: itemLista,
        valor_servicos: valorStr,
        valor_final_cobrado: valorStr,
        base_calculo: valorStr,
        aliquota: String(iss),
        iss_retido: "0",
        valor_ipi: 0,
        codigo_nbs: nbs,
        codigo_indicador_operacao: indOp,
        ibs_cbs_classificacao_tributaria: ibs,
      },
      exigibilidade_suspensa: 0,
      pagamento_parcelado_antecipado: 0,
      finalidade_emissao: 0,
      consumidor_final: 0,
      indicador_destinatario: 0,
      tributacao_rps: "T",
    };
  }

  const itemLista = (args.nfse_item_lista_servico ?? "01.01").trim();
  const codigoTrib =
    (args.nfse_codigo_tributario_municipio ?? "620910000").trim() ||
    "620910000";

  const servico: Record<string, unknown> = {
    discriminacao: args.itemsDescription.slice(0, 2000),
    valor_servicos: totalNum,
    item_lista_servico: itemLista,
    codigo_tributario_municipio: codigoTrib,
  };
  if (args.nfse_iss_aliquota != null && Number.isFinite(args.nfse_iss_aliquota)) {
    servico.aliquota = String(args.nfse_iss_aliquota);
  }

  return {
    data_emissao: `${args.orderDate.slice(0, 10)}T12:00:00-03:00`,
    natureza_operacao: "1",
    optante_simples_nacional: args.taxRegime === "simples_nacional",
    incentivador_cultural: false,
    prestador: {
      cnpj,
      inscricao_municipal: im,
    },
    tomador: buildTomador(args.clientDocument, args.clientName),
    servico,
  };
}

/**
 * Emite NFS-e na Focus para o pedido: cria registo `nfes`, envia POST e actualiza URLs/estado.
 */
export async function emitirNFe(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<{ nfe_id: string; focus_ref: string; focus: { ok: boolean; status: number; data: unknown } }> {
  const { data: settings, error: csErr } = await admin
    .from("company_settings")
    .select(
      "cnpj, municipal_registration, tax_regime, focusnfe_token, focusnfe_environment, address_state, nfse_item_lista_servico, nfse_iss_aliquota, nfse_prestador_codigo_municipio, nfse_codigo_nbs, nfse_codigo_indicador_operacao, nfse_ibs_cbs_classificacao_tributaria, nfse_use_sao_paulo_payload, nfse_codigo_tributario_municipio"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (csErr) throw new Error(csErr.message);
  const token = settings?.focusnfe_token?.trim();
  if (!token) throw new Error("Token FocusNFe não configurado (Empresa).");
  const env: FocusNFeEnv =
    settings?.focusnfe_environment === "producao" ? "producao" : "homologacao";

  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .select(
      "id, status, order_date, client_name, client_document, client_address, client_email, client_phone, total"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  if (!so) throw new Error("Pedido não encontrado.");

  const { data: itemRows, error: itemsErr } = await admin
    .from("sales_order_items")
    .select("description, quantity")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (itemsErr) throw new Error(itemsErr.message);
  if (so.status !== "confirmed") {
    throw new Error('Apenas pedidos "Confirmados" podem emitir NFS-e.');
  }

  const { data: blocking } = await admin
    .from("nfes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .in("status", ["pending", "processing", "authorized"]);
  if (blocking?.length) {
    throw new Error("Já existe NFS-e em curso ou autorizada para este pedido.");
  }

  const { data: inserted, error: insErr } = await admin
    .from("nfes")
    .insert({
      tenant_id: tenantId,
      sales_order_id: salesOrderId,
      status: "processing",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  const focus_ref = focusRefFromNfeId(inserted.id);

  const lines = itemRows ?? [];
  const desc = lines
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const r = row as Record<string, unknown>;
      const d = typeof r.description === "string" ? r.description : "";
      const q = Number(r.quantity ?? 0);
      return d ? `${d} (${q})` : "";
    })
    .filter(Boolean)
    .join("; ");
  const itemsDescription =
    desc || `Pedido de venda — total R$ ${Number(so.total ?? 0).toFixed(2)}`;

  let payload: Record<string, unknown>;
  try {
    payload = buildNfsePayloadFromSalesOrder({
      orderDate: String(so.order_date ?? new Date().toISOString().slice(0, 10)),
      clientName: String(so.client_name ?? "Consumidor"),
      clientDocument:
        so.client_document == null ? null : String(so.client_document),
      clientAddress:
        so.client_address == null ? null : String(so.client_address),
      clientEmail: so.client_email == null ? null : String(so.client_email),
      clientPhone: so.client_phone == null ? null : String(so.client_phone),
      total: Number(so.total ?? 0),
      itemsDescription,
      companyCnpj: settings?.cnpj ?? null,
      municipalRegistration: settings?.municipal_registration ?? null,
      taxRegime: settings?.tax_regime ?? null,
      companyAddressState: settings?.address_state ?? null,
      nfse_item_lista_servico: settings?.nfse_item_lista_servico ?? null,
      nfse_iss_aliquota: settings?.nfse_iss_aliquota ?? null,
      nfse_prestador_codigo_municipio:
        settings?.nfse_prestador_codigo_municipio ?? null,
      nfse_codigo_nbs: settings?.nfse_codigo_nbs ?? null,
      nfse_codigo_indicador_operacao:
        settings?.nfse_codigo_indicador_operacao ?? null,
      nfse_ibs_cbs_classificacao_tributaria:
        settings?.nfse_ibs_cbs_classificacao_tributaria ?? null,
      nfse_use_sao_paulo_payload: Boolean(settings?.nfse_use_sao_paulo_payload),
      nfse_codigo_tributario_municipio:
        settings?.nfse_codigo_tributario_municipio ?? null,
    });
  } catch (e) {
    await admin
      .from("nfes")
      .update({
        status: "error",
        error_message: e instanceof Error ? e.message : "Erro ao montar NFS-e.",
      })
      .eq("id", inserted.id)
      .eq("tenant_id", tenantId);
    throw e;
  }

  const res = await emitirNFSeHttp(token, env, focus_ref, payload);
  const mapped = mapFocusNfseResponse(res.data);
  const status = mapApiStatusToDb(mapped.apiStatus, res.ok);

  await admin
    .from("nfes")
    .update({
      status,
      nfe_number: mapped.nfe_number,
      nfe_key: mapped.nfe_key,
      xml_url: mapped.xml_url,
      pdf_url: mapped.pdf_url,
      error_message:
        status === "error"
          ? mapped.error_message ??
            (typeof (res.data as Record<string, unknown>)?.mensagem === "string"
              ? String((res.data as Record<string, unknown>).mensagem)
              : `HTTP ${res.status}`)
          : null,
    })
    .eq("id", inserted.id)
    .eq("tenant_id", tenantId);

  return { nfe_id: inserted.id, focus_ref, focus: res };
}

export async function consultarNFe(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { data: row, error } = await admin
    .from("nfes")
    .select("id, tenant_id")
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("NFS-e não encontrada.");

  const { data: settings, error: csErr } = await admin
    .from("company_settings")
    .select("focusnfe_token, focusnfe_environment")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (csErr) throw new Error(csErr.message);
  const token = settings?.focusnfe_token?.trim();
  if (!token) throw new Error("Token FocusNFe não configurado.");
  const env: FocusNFeEnv =
    settings?.focusnfe_environment === "producao" ? "producao" : "homologacao";

  const ref = focusRefFromNfeId(nfeId);
  const res = await consultarNFSeHttp(token, env, ref);
  const mapped = mapFocusNfseResponse(res.data);
  const status = mapApiStatusToDb(mapped.apiStatus, res.ok);

  await admin
    .from("nfes")
    .update({
      status,
      nfe_number: mapped.nfe_number,
      nfe_key: mapped.nfe_key,
      xml_url: mapped.xml_url,
      pdf_url: mapped.pdf_url,
      error_message:
        status === "error" ? mapped.error_message : null,
    })
    .eq("id", nfeId)
    .eq("tenant_id", tenantId);

  return res;
}

export async function cancelarNFe(
  admin: Admin,
  tenantId: string,
  nfeId: string,
  justificativa: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (justificativa.trim().length < 15) {
    throw new Error("Justificativa deve ter pelo menos 15 caracteres.");
  }

  const { data: row, error } = await admin
    .from("nfes")
    .select("id, status")
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("NFS-e não encontrada.");

  const { data: settings, error: csErr } = await admin
    .from("company_settings")
    .select("focusnfe_token, focusnfe_environment")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (csErr) throw new Error(csErr.message);
  const token = settings?.focusnfe_token?.trim();
  if (!token) throw new Error("Token FocusNFe não configurado.");
  const env: FocusNFeEnv =
    settings?.focusnfe_environment === "producao" ? "producao" : "homologacao";

  const ref = focusRefFromNfeId(nfeId);
  const res = await cancelarNFSeHttp(token, env, ref, justificativa.trim());
  const nextStatus: NfeDbStatus = res.ok ? "cancelled" : "error";
  await admin
    .from("nfes")
    .update({
      status: nextStatus,
      error_message: res.ok ? null : `Falha ao cancelar (HTTP ${res.status})`,
    })
    .eq("id", nfeId)
    .eq("tenant_id", tenantId);

  return res;
}
