/** Calcula valid_until = quote_date + validity_days (datas ISO YYYY-MM-DD). */
export function computeValidUntil(
  quoteDate: string,
  validityDays: number
): string {
  const base = String(quoteDate).slice(0, 10);
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Data do orçamento inválida.");
  }
  const days = Math.max(1, Math.floor(validityDays));
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseValidityDays(
  raw: unknown,
  defaultDays = 30
): number | { error: string } {
  if (raw === undefined || raw === null) return defaultDays;
  const n =
    typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) {
    return { error: "Validade em dias deve ser um inteiro ≥ 1." };
  }
  return n;
}

export const QUOTE_SHIPPING_TYPES = ["FOB", "CIF", "Outro"] as const;
export type QuoteShippingType = (typeof QUOTE_SHIPPING_TYPES)[number];

export function parseQuoteFreightCost(
  raw: unknown,
  shippingType: string
): number | { error: string } {
  if (shippingType !== "CIF") return 0;
  if (raw === undefined || raw === null || raw === "") return 0;
  const v =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(v) || v < 0) {
    return { error: "Valor do frete inválido." };
  }
  return Math.round(v * 100) / 100;
}

export function parseShippingType(
  raw: unknown,
  defaultType: QuoteShippingType = "FOB"
): QuoteShippingType | { error: string } {
  if (raw === undefined || raw === null || raw === "") return defaultType;
  const s = String(raw).trim();
  if ((QUOTE_SHIPPING_TYPES as readonly string[]).includes(s)) {
    return s as QuoteShippingType;
  }
  return { error: "Tipo de frete inválido." };
}
