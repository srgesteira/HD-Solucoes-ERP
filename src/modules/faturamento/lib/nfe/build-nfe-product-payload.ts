/**
 * Monta payload NF-e modelo 55 (produto / industrialização) para Focus POST /v2/nfe.
 * Homologação primeiro — produção só com OK explícito.
 */

import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export type NfeProductLineInput = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  ncm: string | null;
  cfop: string | null;
  icms_rate: number | null;
  ipi_rate: number | null;
};

export type NfeProductPayloadInput = {
  documentType: Exclude<InvoiceDocumentType, "nfse">;
  orderDate: string;
  orderNumber: string;
  clientName: string;
  clientDocument: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  companyCnpj: string | null;
  companyIe: string | null;
  companyAddressState: string | null;
  companyAddressCity: string | null;
  companyAddressStreet: string | null;
  companyAddressNumber: string | null;
  companyAddressNeighborhood: string | null;
  companyAddressZip: string | null;
  items: NfeProductLineInput[];
};

function naturezaOperacao(doc: Exclude<InvoiceDocumentType, "nfse">): string {
  return doc === "nfe_industrialization"
    ? "Industrialização por encomenda"
    : "Venda de mercadoria";
}

function defaultCfop(
  doc: Exclude<InvoiceDocumentType, "nfse">,
  sameState: boolean
): string {
  if (doc === "nfe_industrialization") {
    return sameState ? "5124" : "6124";
  }
  return sameState ? "5102" : "6102";
}

function parseUfFromAddress(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/\b([A-Z]{2})\b\s*$/i) ?? address.match(/\/\s*([A-Z]{2})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function extractCep(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})[\s\-.]?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

export function validateNfeProductPayloadInput(
  args: NfeProductPayloadInput
): string[] {
  const errors: string[] = [];
  const cnpj = onlyDigits(args.companyCnpj ?? "");
  if (cnpj.length !== 14) errors.push("CNPJ da empresa inválido.");
  if (!args.items.length) errors.push("Pedido sem itens.");
  for (const [i, it] of args.items.entries()) {
    const ncm = onlyDigits(it.ncm ?? "");
    if (ncm.length !== 8) {
      errors.push(`Item ${i + 1}: NCM inválido ou ausente.`);
    }
    if (!it.cfop && !it.ncm) {
      /* cfop pode ser default */
    }
    if (!(it.quantity > 0) || !(it.unit_price >= 0)) {
      errors.push(`Item ${i + 1}: quantidade/preço inválidos.`);
    }
  }
  const destDoc = onlyDigits(args.clientDocument ?? "");
  if (destDoc.length !== 11 && destDoc.length !== 14) {
    errors.push("Documento do destinatário (CPF/CNPJ) inválido.");
  }
  if (!extractCep(args.clientAddress) && !args.clientAddress?.trim()) {
    errors.push("Endereço do destinatário ausente.");
  }
  return errors;
}

export function buildNfeProductPayloadFromSalesOrder(
  args: NfeProductPayloadInput
): Record<string, unknown> {
  const errors = validateNfeProductPayloadInput(args);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const cnpj = onlyDigits(args.companyCnpj ?? "");
  const destDoc = onlyDigits(args.clientDocument ?? "");
  const destUf = parseUfFromAddress(args.clientAddress) ?? "SP";
  const originUf = (args.companyAddressState ?? "SP").trim().toUpperCase().slice(0, 2);
  const sameState = destUf === originUf;
  const cep = extractCep(args.clientAddress) ?? "00000000";

  const items = args.items.map((it, idx) => {
    const cfop =
      onlyDigits(it.cfop ?? "").slice(0, 4) ||
      defaultCfop(args.documentType, sameState);
    const ncm = onlyDigits(it.ncm ?? "");
    const icms = Number(it.icms_rate ?? 0);
    return {
      numero_item: String(idx + 1),
      codigo_produto: String(idx + 1).padStart(4, "0"),
      descricao: it.description.slice(0, 120),
      cfop,
      unidade_comercial: (it.unit || "UN").slice(0, 6),
      quantidade_comercial: it.quantity,
      valor_unitario_comercial: it.unit_price,
      valor_bruto: it.total_price > 0 ? it.total_price : it.quantity * it.unit_price,
      unidade_tributavel: (it.unit || "UN").slice(0, 6),
      quantidade_tributavel: it.quantity,
      valor_unitario_tributavel: it.unit_price,
      codigo_ncm: ncm,
      icms_origem: "0",
      icms_situacao_tributaria: icms > 0 ? "00" : "41",
      ...(icms > 0
        ? {
            icms_base_calculo: it.total_price,
            icms_aliquota: icms,
            icms_valor: (it.total_price * icms) / 100,
          }
        : {}),
      ...(Number(it.ipi_rate ?? 0) > 0
        ? {
            ipi_situacao_tributaria: "99",
            ipi_codigo_enquadramento_legal: "999",
            ipi_aliquota: Number(it.ipi_rate),
            ipi_valor: (it.total_price * Number(it.ipi_rate)) / 100,
          }
        : { ipi_situacao_tributaria: "99", ipi_codigo_enquadramento_legal: "999" }),
    };
  });

  const total = items.reduce(
    (s, it) => s + Number(it.valor_bruto ?? 0),
    0
  );

  return {
    natureza_operacao: naturezaOperacao(args.documentType),
    data_emissao: `${args.orderDate}T12:00:00-03:00`,
    data_entrada_saida: `${args.orderDate}T12:00:00-03:00`,
    tipo_documento: "1",
    finalidade_emissao: "1",
    local_destino: sameState ? "1" : "2",
    consumidor_final: destDoc.length === 11 ? "1" : "0",
    presenca_comprador: "9",
    cnpj_emitente: cnpj,
    inscricao_estadual_emitente: (args.companyIe ?? "").trim() || undefined,
    logradouro_emitente: args.companyAddressStreet ?? undefined,
    numero_emitente: args.companyAddressNumber ?? undefined,
    bairro_emitente: args.companyAddressNeighborhood ?? undefined,
    municipio_emitente: args.companyAddressCity ?? undefined,
    uf_emitente: originUf,
    cep_emitente: onlyDigits(args.companyAddressZip ?? "") || undefined,
    nome_destinatario: args.clientName,
    ...(destDoc.length === 14
      ? { cnpj_destinatario: destDoc }
      : { cpf_destinatario: destDoc }),
    email_destinatario: args.clientEmail?.trim() || undefined,
    telefone_destinatario: onlyDigits(args.clientPhone ?? "") || undefined,
    logradouro_destinatario: (args.clientAddress ?? "Endereço do pedido")
      .replace(/\b\d{5}[\s\-.]?\d{3}\b/g, "")
      .trim()
      .slice(0, 60) || "Endereço do pedido",
    numero_destinatario: "S/N",
    bairro_destinatario: "Centro",
    municipio_destinatario: "SAO PAULO",
    uf_destinatario: destUf,
    cep_destinatario: cep,
    valor_frete: 0,
    valor_seguro: 0,
    valor_desconto: 0,
    valor_produtos: total,
    valor_total: total,
    modalidade_frete: "9",
    items,
    informacoes_adicionais_contribuinte: `Pedido ${args.orderNumber}`,
  };
}
