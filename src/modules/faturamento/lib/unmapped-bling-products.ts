import type { FiscalOrderReviewItem } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { isBlingNfeInvoiceType } from "@/modules/core/types/sales-order-billing.types";

export function isBlingProductInvoiceType(
  invoiceDocumentType: string | null | undefined
): boolean {
  return isBlingNfeInvoiceType(invoiceDocumentType);
}

/** Um registo por produto (várias linhas do mesmo SKU não repetem o botão). */
export function uniqueUnmappedBlingItems(
  items: FiscalOrderReviewItem[],
  invoiceDocumentType: string | null | undefined
): FiscalOrderReviewItem[] {
  if (!isBlingProductInvoiceType(invoiceDocumentType)) return [];
  const seen = new Set<string>();
  const out: FiscalOrderReviewItem[] = [];
  for (const it of items) {
    if (!it.product_id || it.bling_product_id) continue;
    if (seen.has(it.product_id)) continue;
    seen.add(it.product_id);
    out.push(it);
  }
  return out;
}
