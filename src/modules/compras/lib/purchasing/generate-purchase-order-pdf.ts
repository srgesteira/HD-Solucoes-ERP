import type { PurchaseOrderPrintContext } from "@/modules/compras/lib/purchasing/fetch-purchase-order-print";
import { buildPurchaseOrderPrintHtml } from "@/modules/compras/lib/purchasing/purchase-order-print-html";
import {
  htmlToPdfBuffer,
  remoteImageAsDataUrl,
} from "@/modules/compras/lib/purchasing/html-to-pdf-buffer";

/** PDF idêntico ao layout da pré-visualização de impressão (HTML → Chrome/Edge). */
export async function generatePurchaseOrderPdfBuffer(
  ctx: PurchaseOrderPrintContext
): Promise<Buffer> {
  const logoSrc = ctx.company?.logo_url
    ? await remoteImageAsDataUrl(ctx.company.logo_url)
    : null;
  const html = buildPurchaseOrderPrintHtml(ctx.order, ctx.company, logoSrc);
  return htmlToPdfBuffer(html);
}
