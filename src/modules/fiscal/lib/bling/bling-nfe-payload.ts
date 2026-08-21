import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { isInvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import type { FiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import {
  buildNfeComplementaryInfo,
  type NfeComplementaryInfoSource,
} from "@/modules/faturamento/lib/nfe-complementary-info";
import { buildBlingNfeParcelas } from "@/modules/fiscal/lib/bling/bling-nfe-parcelas";

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

/**
 * Campos do POST /nfe que o ERP controla.
 * Conferência e emissão usam esta função — sem segunda lógica.
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
