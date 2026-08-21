import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { isInvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import {
  buildNfeComplementaryInfo,
  type NfeComplementaryInfoSource,
} from "@/modules/faturamento/lib/nfe-complementary-info";
import { buildBlingNfeParcelas } from "@/modules/fiscal/lib/bling/bling-nfe-parcelas";
import { parseFreeformAddressToBling } from "@/modules/fiscal/lib/bling/bling-contact-address";

export function blingNfeNaturezaOperacao(docType: InvoiceDocumentType): string {
  return docType === "nfe_industrialization"
    ? "Industrialização"
    : "Venda de mercadorias";
}

export function blingNfeErpMarker(salesOrderId: string): string {
  return `HD-ERP:${salesOrderId}`;
}

/** `observacoes` do POST /nfe — mesma função da emissão. */
export function buildBlingNfeObservacoes(
  source: Pick<
    NfeComplementaryInfoSource,
    "order_number" | "customer_po_number" | "delivery_address_formatted"
  >,
  salesOrderId: string
): string {
  return [buildNfeComplementaryInfo(source), blingNfeErpMarker(salesOrderId)]
    .filter(Boolean)
    .join("\n");
}

function isoDateSaoPaulo(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function nfeDataOperacao(orderDate: string | null | undefined): string {
  const raw = String(orderDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return isoDateSaoPaulo();
}

export function fiscalReviewToBlingNfeCreateInput(
  review: Pick<
    FiscalOrderReview,
    | "id"
    | "order_number"
    | "customer_po_number"
    | "delivery_address_formatted"
    | "client_name"
    | "client_document"
    | "client_email"
    | "client_phone"
    | "client_address"
    | "order_date"
    | "discount"
    | "items"
    | "payment_installments"
    | "payment_days_to_first_due"
    | "payment_days_between_installments"
    | "actual_delivery"
    | "expected_delivery"
    | "total"
  >,
  contactId: number | null,
  operationDate?: string
): BlingNfeCreateBodyInput {
  return {
    salesOrderId: review.id,
    contactId,
    clientName: review.client_name,
    clientDocument: review.client_document,
    clientEmail: review.client_email,
    clientPhone: review.client_phone,
    clientAddress: review.client_address,
    orderDate: operationDate ?? nfeDataOperacao(review.order_date),
    headerDiscount: Number(review.discount ?? 0),
    items: review.items.map((it) => ({
      code: it.product_code,
      description: it.description,
      name: it.product_name,
      unit: it.unit,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount: it.discount,
      ncm: it.ncm,
      cfop: it.cfop,
      usage_type: it.usage_type,
    })),
    observacoesSource: {
      order_number: review.order_number,
      customer_po_number: review.customer_po_number,
      delivery_address_formatted: review.delivery_address_formatted,
    },
    paymentSource: fiscalReviewToNfePayloadSource(review),
  };
}

export function fiscalReviewToNfePayloadSource(
  review: Pick<
    FiscalOrderReview,
    | "order_number"
    | "customer_po_number"
    | "delivery_address_formatted"
    | "payment_installments"
    | "payment_days_to_first_due"
    | "payment_days_between_installments"
    | "actual_delivery"
    | "expected_delivery"
    | "order_date"
    | "total"
  >
): NfeComplementaryInfoSource & { total: number } {
  return {
    order_number: review.order_number,
    customer_po_number: review.customer_po_number,
    delivery_address_formatted: review.delivery_address_formatted,
    payment_installments: review.payment_installments,
    payment_days_to_first_due: review.payment_days_to_first_due,
    payment_days_between_installments:
      review.payment_days_between_installments,
    actual_delivery: review.actual_delivery,
    expected_delivery: review.expected_delivery,
    order_date: review.order_date,
    total: Number(review.total ?? 0),
  };
}

export type BlingNfePayloadViewItem = {
  codigo?: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor: number;
  desconto?: number;
};

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** CSOSN permitido pela SEFAZ (rej. 600) quando o destino é não contribuinte. */
export const CSOSN_NAO_CONTRIBUINTE = "102";

export function isConsumidorFinal(
  items: Array<{ usage_type?: string | null }>
): boolean {
  return (
    items.length > 0 &&
    items.every((it) => !it.usage_type || it.usage_type === "consumo")
  );
}

export function digitsOnlyDoc(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function ncmToClassificacaoFiscal(
  ncm: string | null | undefined
): string | undefined {
  const d = String(ncm ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(0, 8) : undefined;
}

/** SKU para `itens[].codigo` (obrigatório no POST /nfe). */
export function skuForBlingNfeItem(input: {
  code?: string | null;
  technical_code?: string | null;
  description?: string | null;
}): string {
  const code = input.code?.trim();
  if (code) return code;
  const technical = input.technical_code?.trim();
  if (technical) return technical;
  const desc = String(input.description ?? "").trim();
  const m = desc.match(/^([A-Za-z0-9][A-Za-z0-9._/-]{2,})\s+[—–-]/);
  return m?.[1] ?? "";
}

export type BlingNfeCreateItemInput = {
  code?: string | null;
  technical_code?: string | null;
  description: string;
  name?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  discount?: number | null;
  ncm?: string | null;
  cfop?: string | null;
  usage_type?: string | null;
};

export type BlingNfeCreateBodyInput = {
  salesOrderId: string;
  contactId?: number | null;
  clientName: string;
  clientDocument: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  orderDate: string;
  headerDiscount: number;
  items: BlingNfeCreateItemInput[];
  observacoesSource: Pick<
    NfeComplementaryInfoSource,
    "order_number" | "customer_po_number" | "delivery_address_formatted"
  >;
  paymentSource: NfeComplementaryInfoSource & { total: number };
};

/**
 * Corpo do POST /nfe (API v3).
 * Schema: contato (nome/tipoPessoa/numeroDocumento), itens[].codigo obrigatório,
 * classificacaoFiscal = NCM, desconto no cabeçalho (R$), dataOperacao.
 * Não envia naturezaOperacao em texto nem produto.id — o Bling rejeita.
 * @see https://developer.bling.com.br/referencia#/Notas%20Fiscais%20Eletr%C3%B4nicas/post_nfe
 */
export function buildBlingNfeCreateBody(input: BlingNfeCreateBodyInput): {
  tipo: 1;
  finalidade: 1;
  dataOperacao: string;
  consumidorFinal?: boolean;
  contato: {
    id?: number;
    nome: string;
    tipoPessoa: "F" | "J";
    numeroDocumento: string;
    contribuinte?: 1 | 2 | 9;
    email?: string;
    telefone?: string;
    endereco?: ReturnType<typeof parseFreeformAddressToBling>;
  };
  itens: Array<{
    codigo: string;
    descricao: string;
    unidade: string;
    quantidade: number;
    valor: number;
    tipo: "P";
    classificacaoFiscal?: string;
    origem?: number;
    situacaoTributaria?: string;
    cst?: string;
    simples?: { cst: string };
    cfop?: string;
  }>;
  desconto?: number;
  observacoes: string;
  parcelas: ReturnType<typeof buildBlingNfeParcelas>;
} {
  const numeroDocumento = digitsOnlyDoc(input.clientDocument);
  if (numeroDocumento.length < 11) {
    throw new Error("Cliente sem CPF/CNPJ válido para emitir a NF-e no Bling.");
  }

  const missingSku: string[] = [];
  const consumidorFinal = isConsumidorFinal(input.items);
  const itens = input.items.map((it) => {
    const codigo = skuForBlingNfeItem({
      code: it.code,
      technical_code: it.technical_code,
      description: it.description,
    });
    if (!codigo) {
      missingSku.push((it.name ?? it.description).trim() || "item sem descrição");
    }
    const cfop = String(it.cfop ?? "").replace(/\D/g, "");
    return {
      codigo,
      descricao: (it.name ?? it.description).trim() || "—",
      unidade: it.unit?.trim() || "UN",
      quantidade: Number(it.quantity ?? 0),
      valor: roundMoney(Number(it.unit_price ?? 0)),
      tipo: "P" as const,
      classificacaoFiscal: ncmToClassificacaoFiscal(it.ncm),
      origem: 0,
      ...(consumidorFinal
        ? {
            situacaoTributaria: CSOSN_NAO_CONTRIBUINTE,
            cst: CSOSN_NAO_CONTRIBUINTE,
            simples: { cst: CSOSN_NAO_CONTRIBUINTE },
          }
        : {}),
      ...(cfop.length === 4 ? { cfop } : {}),
    };
  });
  if (missingSku.length > 0) {
    throw new Error(
      `Item(ns) sem código/SKU para a NF-e: ${missingSku.join(", ")}.`
    );
  }

  const lineDiscount = roundMoney(
    input.items.reduce((acc, it) => acc + Math.max(0, Number(it.discount ?? 0)), 0)
  );
  const header = roundMoney(Math.max(0, Number(input.headerDiscount ?? 0)));
  const desconto = roundMoney(lineDiscount + header);

  const email = input.clientEmail?.trim() || undefined;
  const telefone = input.clientPhone?.trim() || undefined;
  const endereco = parseFreeformAddressToBling(input.clientAddress ?? null);

  return {
    tipo: 1,
    finalidade: 1,
    dataOperacao: String(input.orderDate ?? "").slice(0, 10),
    ...(consumidorFinal ? { consumidorFinal: true } : {}),
    contato: {
      ...(Number.isFinite(input.contactId) && input.contactId
        ? { id: Number(input.contactId) }
        : {}),
      nome: input.clientName.trim() || "Cliente",
      tipoPessoa: numeroDocumento.length === 14 ? "J" : "F",
      numeroDocumento,
      ...(consumidorFinal ? { contribuinte: 9 as const } : {}),
      ...(email ? { email } : {}),
      ...(telefone ? { telefone } : {}),
      ...(endereco ? { endereco } : {}),
    },
    itens,
    desconto: desconto > 0 ? desconto : undefined,
    observacoes: buildBlingNfeObservacoes(
      input.observacoesSource,
      input.salesOrderId
    ),
    parcelas: buildBlingNfeParcelas(input.paymentSource),
  };
}

/** Ajusta GET /nfe para PUT: CSOSN 102 + contribuinte 9 (SEFAZ 600). */
export function applyNaoContribuinteCsosnToNfeData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const contatoRaw =
    data.contato && typeof data.contato === "object"
      ? (data.contato as Record<string, unknown>)
      : {};
  const itensRaw = Array.isArray(data.itens) ? data.itens : [];
  const itens = itensRaw.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const item = raw as Record<string, unknown>;
    const simples =
      item.simples && typeof item.simples === "object"
        ? { ...(item.simples as Record<string, unknown>) }
        : {};
    const icms =
      item.icms && typeof item.icms === "object"
        ? { ...(item.icms as Record<string, unknown>) }
        : {};
    return {
      ...item,
      situacaoTributaria: CSOSN_NAO_CONTRIBUINTE,
      cst: CSOSN_NAO_CONTRIBUINTE,
      simples: { ...simples, cst: CSOSN_NAO_CONTRIBUINTE },
      icms: { ...icms, cst: CSOSN_NAO_CONTRIBUINTE },
    };
  });
  return {
    ...data,
    consumidorFinal: true,
    contato: {
      ...contatoRaw,
      contribuinte: 9,
    },
    itens,
  };
}

/**
 * Pré-visualização na conferência (DANFE estilo). Valores de linha com
 * desconto por item — o POST /nfe real usa `buildBlingNfeCreateBody`.
 */
export function buildBlingNfePayloadView(review: FiscalOrderReview): {
  tipo: 1;
  finalidade: 1;
  naturezaOperacao: string;
  data: string;
  desconto?: number;
  observacoes: string;
  parcelas: ReturnType<typeof buildBlingNfeParcelas>;
  itens: BlingNfePayloadViewItem[];
} {
  const source = fiscalReviewToNfePayloadSource(review);
  const docType: InvoiceDocumentType = isInvoiceDocumentType(
    review.invoice_document_type
  )
    ? review.invoice_document_type
    : "nfe_product";
  const desconto = Number(review.discount ?? 0);
  return {
    tipo: 1,
    finalidade: 1,
    naturezaOperacao: blingNfeNaturezaOperacao(docType),
    data: String(review.order_date ?? "").slice(0, 10),
    desconto: desconto > 0 ? desconto : undefined,
    observacoes: buildBlingNfeObservacoes(source, review.id),
    parcelas: buildBlingNfeParcelas(source),
    itens: review.items.map((it) => {
      const disc = Number(it.discount ?? 0);
      return {
        codigo: it.product_code?.trim() || undefined,
        descricao: (it.product_name ?? it.description).trim() || "—",
        unidade: it.unit?.trim() || "UN",
        quantidade: Number(it.quantity ?? 0),
        valor: Number(it.unit_price ?? 0),
        desconto: disc > 0 ? disc : undefined,
      };
    }),
  };
}
