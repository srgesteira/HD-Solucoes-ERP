import {
  approximateBdiBreakdown,
  calculateBdiSellingPrice,
  coerceNum,
  totalTaxPctFromSettingsOrCompany,
  type BdiSettingsSlice,
} from "@/modules/engenharia/lib/pricing/bdi-calculate";

export type QuoteMarkupLineInput = {
  id?: string;
  product_id?: string | null;
  description?: string | null;
  unit_price: number;
  quantity: number;
  markup_percent?: number | null;
  product?: {
    cost_price?: number | null;
    name?: string | null;
    technical_code?: string | null;
    code?: string | null;
  } | null;
};

export type QuoteMarkupLineAnalysis = {
  lineId?: string;
  productId: string | null;
  label: string;
  cost: number;
  unitPrice: number;
  quantity: number;
  quotedMarkupPct: number | null;
  bdiSuggestedPrice: number;
  bdiMarkupPct: number | null;
  belowMinMarkup: boolean;
};

export type QuoteMarkupSummary = {
  minMarkupPct: number;
  linesBelowMin: number;
  listHint: string;
  lines: QuoteMarkupLineAnalysis[];
};

export function markupPercentFromPrices(
  cost: number,
  unitPrice: number
): number | null {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
  return Math.round((unitPrice / cost - 1) * 10000) / 100;
}

function productLabel(
  product: QuoteMarkupLineInput["product"],
  fallback?: string | null
): string {
  const sku =
    product?.technical_code?.trim() ||
    product?.code?.trim() ||
    fallback?.trim() ||
    "—";
  const name = product?.name?.trim() || fallback?.trim() || "Produto";
  return sku !== "—" ? `${sku} — ${name}` : name;
}

export function analyzeQuoteMarkupLines(
  items: QuoteMarkupLineInput[],
  settings: BdiSettingsSlice,
  companyTaxRegime: string | null,
  companyDasAliquot: number | null
): QuoteMarkupSummary {
  const minMarkupPct = coerceNum(settings.min_markup);
  const lines: QuoteMarkupLineAnalysis[] = [];

  for (const item of items) {
    const cost = coerceNum(item.product?.cost_price);
    const unitPrice = coerceNum(item.unit_price);
    if (cost <= 0) continue;

    const bdiSuggestedPrice = calculateBdiSellingPrice({
      cost,
      settings,
      companyTaxRegime,
      companyDasAliquot,
    });
    const quotedMarkupPct = markupPercentFromPrices(cost, unitPrice);
    const bdiMarkupPct = markupPercentFromPrices(cost, bdiSuggestedPrice);
    const belowMinMarkup =
      minMarkupPct > 0 &&
      quotedMarkupPct != null &&
      quotedMarkupPct + 0.001 < minMarkupPct;

    lines.push({
      lineId: item.id,
      productId: item.product_id ?? null,
      label: productLabel(item.product, item.description),
      cost,
      unitPrice,
      quantity: coerceNum(item.quantity, 1),
      quotedMarkupPct,
      bdiSuggestedPrice,
      bdiMarkupPct,
      belowMinMarkup,
    });
  }

  const linesBelowMin = lines.filter((l) => l.belowMinMarkup).length;

  let listHint = "Custo actualizado — confirme o preço acordado";
  if (linesBelowMin > 0 && minMarkupPct > 0) {
    listHint =
      linesBelowMin === 1
        ? `Abaixo do markup mínimo (${minMarkupPct}%)`
        : `${linesBelowMin} itens abaixo do markup mínimo (${minMarkupPct}%)`;
  }

  return {
    minMarkupPct,
    linesBelowMin,
    listHint,
    lines,
  };
}

export function bdiBreakdownForCost(
  cost: number,
  settings: BdiSettingsSlice,
  companyTaxRegime: string | null,
  companyDasAliquot: number | null
) {
  const selling = calculateBdiSellingPrice({
    cost,
    settings,
    companyTaxRegime,
    companyDasAliquot,
  });
  const taxPct = totalTaxPctFromSettingsOrCompany(
    settings,
    companyTaxRegime,
    companyDasAliquot
  );
  const isSimples = companyTaxRegime === "simples_nacional";
  return approximateBdiBreakdown(cost, selling, {
    taxes: taxPct,
    admin: settings.admin_overhead,
    commercial: settings.commercial_overhead,
    financial: settings.financial_overhead,
    profit: settings.profit_margin,
    taxLabel: isSimples ? "DAS (est.)" : "Impostos (est.)",
  });
}

export type BdiPricingContext = {
  settings: BdiSettingsSlice;
  companyTaxRegime: string | null;
  companyDasAliquot: number | null;
};

export async function loadBdiPricingContext(): Promise<BdiPricingContext> {
  const res = await fetch("/api/settings/bdi", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    slice?: BdiSettingsSlice;
    company_tax_regime?: string | null;
    company_das_aliquot?: number | null;
    error?: string;
  };
  if (!res.ok || !json.slice) {
    throw new Error(json.error ?? "Erro ao carregar BDI");
  }
  return {
    settings: json.slice,
    companyTaxRegime: json.company_tax_regime ?? null,
    companyDasAliquot:
      json.company_das_aliquot != null ? Number(json.company_das_aliquot) : null,
  };
}

export async function acknowledgeQuoteCostReview(quoteId: string): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${quoteId}/acknowledge-structure`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Erro ao confirmar revisão de custo");
  }
}
