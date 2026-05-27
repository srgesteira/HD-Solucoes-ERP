/** Arredondamento monetário (2 casas). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Subtotal da linha (quantidade × preço unitário). */
export function lineSubtotal(quantity: number, unitPrice: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return roundMoney(q * p);
}

/** Total da linha para exibição: subtotal + IPI (ICMS informativo, já no subtotal da NF). */
export function lineDisplayTotal(
  quantity: number,
  unitPrice: number,
  ipiValue: number
): number {
  return roundMoney(lineSubtotal(quantity, unitPrice) + Number(ipiValue ?? 0));
}

/** @deprecated Use lineSubtotal */
export function lineBaseAmount(quantity: number, unitPrice: number): number {
  return lineSubtotal(quantity, unitPrice);
}

export function taxAmountFromRate(base: number, ratePercent: number): number {
  const rate = Number.isFinite(ratePercent) ? ratePercent : 0;
  if (rate <= 0) return 0;
  const b = Number.isFinite(base) ? base : 0;
  return roundMoney((b * rate) / 100);
}

export type PurchaseLineTaxFields = {
  icmsRate: number;
  icmsValue: number;
  ipiRate: number;
  ipiValue: number;
  taxBase: number;
};

export type RecalcTaxMode = "icms" | "ipi" | "both" | "none";

/**
 * Regra: IPI sobre subtotal; base ICMS = subtotal + IPI; ICMS sobre a base.
 * Ao editar valor manualmente (mode "none"), mantém o valor informado.
 */
export function recalcLineTaxAmounts(
  quantity: number,
  unitPrice: number,
  fields: PurchaseLineTaxFields,
  mode: RecalcTaxMode = "both"
): PurchaseLineTaxFields {
  const subtotal = lineSubtotal(quantity, unitPrice);

  let ipiValue = fields.ipiValue;
  if (mode === "ipi" || mode === "both") {
    ipiValue = taxAmountFromRate(subtotal, fields.ipiRate);
  }

  const taxBase = roundMoney(subtotal + ipiValue);

  let icmsValue = fields.icmsValue;
  if (mode === "icms" || mode === "both") {
    icmsValue = taxAmountFromRate(taxBase, fields.icmsRate);
  } else if (mode === "ipi") {
    // IPI alterado: recalcula base e ICMS se houver alíquota ICMS
    if (fields.icmsRate > 0) {
      icmsValue = taxAmountFromRate(taxBase, fields.icmsRate);
    }
  }

  return {
    icmsRate: fields.icmsRate,
    icmsValue,
    ipiRate: fields.ipiRate,
    ipiValue,
    taxBase,
  };
}

export function lineTaxFieldsFromDraft(line: {
  quantity: number;
  unitPrice: number;
  icmsRate: number;
  icmsValue: number;
  ipiRate: number;
  ipiValue: number;
  taxBase?: number;
}): PurchaseLineTaxFields {
  const subtotal = lineSubtotal(line.quantity, line.unitPrice);
  const ipiValue = roundMoney(line.ipiValue);
  const taxBase =
    line.taxBase !== undefined && Number.isFinite(line.taxBase)
      ? roundMoney(line.taxBase)
      : roundMoney(subtotal + ipiValue);
  return {
    icmsRate: line.icmsRate,
    icmsValue: roundMoney(line.icmsValue),
    ipiRate: line.ipiRate,
    ipiValue,
    taxBase,
  };
}

export function aggregatePurchaseLineTaxes(
  lines: Array<{
    quantity: number;
    unitPrice: number;
    icmsValue?: number;
    ipiValue?: number;
    taxBase?: number;
  }>
): {
  subtotal: number;
  totalIcms: number;
  totalIpi: number;
  totalTaxBase: number;
} {
  let subtotal = 0;
  let totalIcms = 0;
  let totalIpi = 0;
  let totalTaxBase = 0;

  for (const line of lines) {
    const lineSub = lineSubtotal(line.quantity, line.unitPrice);
    const ipiVal = roundMoney(Number(line.ipiValue ?? 0));
    const base =
      line.taxBase !== undefined && Number.isFinite(line.taxBase)
        ? roundMoney(line.taxBase)
        : roundMoney(lineSub + ipiVal);

    subtotal += lineSub;
    totalIcms += roundMoney(Number(line.icmsValue ?? 0));
    totalIpi += ipiVal;
    totalTaxBase += base;
  }

  return {
    subtotal: roundMoney(subtotal),
    totalIcms: roundMoney(totalIcms),
    totalIpi: roundMoney(totalIpi),
    totalTaxBase: roundMoney(totalTaxBase),
  };
}

export function parseTaxRate(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? parseFloat(raw.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return roundMoney(n);
}

export function parseTaxAmount(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? parseFloat(raw.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

/** Aceita icms_value ou icms_amount (legado API). */
export function parseTaxValueField(
  row: Record<string, unknown>,
  primary: string,
  legacy: string
): unknown {
  if (row[primary] !== undefined && row[primary] !== null) return row[primary];
  return row[legacy];
}
