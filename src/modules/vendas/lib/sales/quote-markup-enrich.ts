import type { SupabaseClient } from "@supabase/supabase-js";
import { bdiRowToSlice } from "@/modules/engenharia/lib/pricing/bdi-db";
import { defaultBdiSettings } from "@/modules/engenharia/lib/pricing/bdi-calculate";
import {
  analyzeQuoteMarkupLines,
  type QuoteMarkupLineInput,
} from "@/modules/vendas/lib/sales/quote-markup-analysis";

export type QuoteMarkupAlert = {
  list_hint: string;
  lines_below_min: number;
  min_markup_pct: number;
};

type QuoteRow = {
  id: string;
  awaiting_commercial_finalize?: boolean | null;
};

export async function enrichQuotesWithMarkupAlerts(
  admin: SupabaseClient,
  tenantId: string,
  quotes: QuoteRow[]
): Promise<Map<string, QuoteMarkupAlert>> {
  const result = new Map<string, QuoteMarkupAlert>();
  const awaiting = quotes.filter((q) => q.awaiting_commercial_finalize);
  if (awaiting.length === 0) return result;

  const quoteIds = awaiting.map((q) => q.id);

  const [{ data: items }, { data: bdiRow }, { data: companyRow }] =
    await Promise.all([
      admin
        .from("quote_items")
        .select(
          "id, quote_id, product_id, description, unit_price, quantity, markup_percent, product:products!quote_items_product_id_fkey(cost_price, name, technical_code, code)"
        )
        .eq("tenant_id", tenantId)
        .in("quote_id", quoteIds),
      admin.from("bdi_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      admin
        .from("company_settings")
        .select("tax_regime, das_aliquot")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

  const settings = bdiRow ? bdiRowToSlice(bdiRow) : defaultBdiSettings();
  const companyTaxRegime = companyRow?.tax_regime ?? null;
  const companyDasAliquot =
    companyRow?.das_aliquot != null ? Number(companyRow.das_aliquot) : null;

  const byQuote = new Map<string, QuoteMarkupLineInput[]>();
  for (const row of items ?? []) {
    const productRaw = row.product as
      | QuoteMarkupLineInput["product"]
      | QuoteMarkupLineInput["product"][]
      | null;
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    const list = byQuote.get(row.quote_id) ?? [];
    list.push({
      id: row.id,
      product_id: row.product_id,
      description: row.description,
      unit_price: Number(row.unit_price),
      quantity: Number(row.quantity),
      markup_percent: row.markup_percent,
      product,
    });
    byQuote.set(row.quote_id, list);
  }

  for (const quote of awaiting) {
    const summary = analyzeQuoteMarkupLines(
      byQuote.get(quote.id) ?? [],
      settings,
      companyTaxRegime,
      companyDasAliquot
    );
    result.set(quote.id, {
      list_hint: summary.listHint,
      lines_below_min: summary.linesBelowMin,
      min_markup_pct: summary.minMarkupPct,
    });
  }

  return result;
}
