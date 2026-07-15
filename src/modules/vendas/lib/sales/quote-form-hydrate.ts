import {
  newQuoteLine,
  reindexQuoteLines,
  type QuoteLineDraft,
  type QuoteLineProduct,
} from "@/components/sales/quote-items-editor";
import { DEFAULT_QUOTE_MARKUP_PERCENT } from "@/modules/vendas/lib/sales/quote-line-pricing";
import { isItemUsageType } from "@/modules/fiscal/lib/item-usage-type";

type ApiProduct = {
  id: string;
  name?: string | null;
  cost_price?: number | null;
  unit?: string | null;
  technical_code?: string | null;
  code?: string | null;
  product_nature?: string | null;
  prefix?: { code?: string | null } | { code?: string | null }[] | null;
} | null;

export type QuoteApiItem = {
  product_id: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  markup_percent?: number | null;
  client_notes?: string | null;
  show_product_description?: boolean | null;
  usage_type?: string | null;
  product?: ApiProduct | ApiProduct[];
};

export function itemsToLinesAndCache(apiItems: QuoteApiItem[]): {
  lines: QuoteLineDraft[];
  cache: Record<string, QuoteLineProduct>;
} {
  const lines: QuoteLineDraft[] = [];
  const cache: Record<string, QuoteLineProduct> = {};

  apiItems.forEach((item, index) => {
    const pid = item.product_id;
    const prod = Array.isArray(item.product) ? item.product[0] : item.product;
    const cost = prod?.cost_price != null ? Number(prod.cost_price) : 0;
    const unitPrice = Number(item.unit_price);
    const usesMarkup = item.markup_percent != null;
    const markup =
      item.markup_percent != null
        ? Number(item.markup_percent)
        : DEFAULT_QUOTE_MARKUP_PERCENT;

    if (prod?.id) {
      const prefixRaw = prod.prefix;
      const prefix = Array.isArray(prefixRaw) ? prefixRaw[0] : prefixRaw;
      cache[pid] = {
        id: prod.id,
        name: prod.name ?? "—",
        cost_price: cost,
        unit: prod.unit ?? null,
        technical_code: prod.technical_code ?? null,
        code: prod.code ?? null,
        product_nature: prod.product_nature ?? null,
        prefix_code: prefix?.code ?? null,
      };
    }

    lines.push({
      key: `line-${index}`,
      productId: pid,
      quantity: Number(item.quantity),
      priceMode: usesMarkup ? "markup" : "manual",
      markupPercent: markup,
      manualPrice: unitPrice,
      costPrice: cost,
      unitPrice,
      unit: item.unit?.trim() || prod?.unit?.trim() || "UN",
      clientNotes: item.client_notes?.trim() ?? "",
      showProductDescription: Boolean(item.show_product_description),
      usageType: isItemUsageType(item.usage_type) ? item.usage_type : "",
    });
  });

  return {
    lines: lines.length ? reindexQuoteLines(lines) : [newQuoteLine(0)],
    cache,
  };
}
