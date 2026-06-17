import type { Tables } from "@/modules/core/types/database";
import {
  htmlToPdfBuffer,
  remoteImageAsDataUrl,
} from "@/modules/compras/lib/purchasing/html-to-pdf-buffer";
import { buildQuotePrintHtml } from "@/modules/vendas/lib/sales/quote-print-html";
import type { QuotePrintData } from "@/modules/vendas/lib/sales/quote-display";

/**
 * Gera o PDF do orçamento — mesmo motor (puppeteer + Chrome) usado para
 * pedidos de compra, garantindo um único caminho de impressão (princípio §1.1).
 */
export async function generateQuotePdfBuffer(
  quote: QuotePrintData,
  company: Tables<"company_settings"> | null | undefined
): Promise<Buffer> {
  const logoSrc = company?.logo_url
    ? await remoteImageAsDataUrl(company.logo_url)
    : null;
  const html = buildQuotePrintHtml(quote, company, logoSrc);
  return htmlToPdfBuffer(html);
}
