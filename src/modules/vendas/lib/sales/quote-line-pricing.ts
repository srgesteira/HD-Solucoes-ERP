/** Markup padrão ao adicionar produto no orçamento (%). */
export const DEFAULT_QUOTE_MARKUP_PERCENT = 30;

export function roundMoney4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Preço unitário = custo × (1 + markup%/100). */
export function unitPriceFromCostAndMarkup(
  costPrice: number,
  markupPercent: number
): number {
  const cost = Number(costPrice);
  const markup = Number(markupPercent);
  if (!Number.isFinite(cost) || cost < 0) return 0;
  if (!Number.isFinite(markup)) return roundMoney4(cost);
  return roundMoney4(cost * (1 + markup / 100));
}

export function lineTotalPrice(unitPrice: number, quantity: number): number {
  const q = Number(quantity);
  const u = Number(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return roundMoney4(q * u);
}

/** Total líquido da linha (bruto − desconto). */
export function lineNetTotalPrice(
  unitPrice: number,
  quantity: number,
  discount = 0
): number {
  const d = Number.isFinite(discount) ? Math.max(0, Number(discount)) : 0;
  return roundMoney4(Math.max(0, lineTotalPrice(unitPrice, quantity) - d));
}

export function parseMarkupPercent(raw: unknown, fallback = DEFAULT_QUOTE_MARKUP_PERCENT): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function parseUnitPrice(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney4(n);
}

export type QuoteLinePriceMode = "markup" | "manual";

/** Indica se o markup foi enviado (modo cálculo por %). */
export function payloadUsesMarkupPercent(raw: unknown): boolean {
  return raw !== undefined && raw !== null && raw !== "";
}
