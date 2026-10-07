/** Campos adicionados por migração antes de regenerar database.ts */
export type SalesOrderBillingClosure = "nfe" | "without_invoice" | null;

export type InvoiceDocumentType =
  | "nfse"
  | "nfe_product"
  | "nfe_industrialization"
  | "nfe_remessa";

export const INVOICE_DOCUMENT_TYPES: InvoiceDocumentType[] = [
  "nfse",
  "nfe_product",
  "nfe_industrialization",
  "nfe_remessa",
];

export const INVOICE_DOCUMENT_TYPE_LABELS: Record<InvoiceDocumentType, string> =
  {
    nfse: "NFS-e (serviço)",
    nfe_product: "NF-e produto",
    nfe_industrialization: "NF-e industrialização",
    nfe_remessa: "NF-e simples remessa",
  };

export function isInvoiceDocumentType(v: unknown): v is InvoiceDocumentType {
  return (
    typeof v === "string" &&
    (INVOICE_DOCUMENT_TYPES as readonly string[]).includes(v)
  );
}

/** NF-e modelo 55 emitida via Bling (não NFS-e). */
export function isBlingNfeInvoiceType(
  v: unknown
): v is Exclude<InvoiceDocumentType, "nfse"> {
  return (
    v === "nfe_product" ||
    v === "nfe_industrialization" ||
    v === "nfe_remessa"
  );
}

export type SalesOrderBillingFields = {
  billing_closure?: SalesOrderBillingClosure;
  billing_plan?: "nfe" | "without_invoice" | null;
  invoice_document_type?: InvoiceDocumentType | null;
};
