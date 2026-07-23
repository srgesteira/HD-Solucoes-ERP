/** Arredondamento monetário (2 casas). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Subtotal bruto da linha (quantidade × preço unitário). */
export function lineSubtotal(quantity: number, unitPrice: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return roundMoney(q * p);
}

/** Subtotal líquido da linha (bruto − desconto, mínimo 0). */
export function lineNetSubtotal(
  quantity: number,
  unitPrice: number,
  discount = 0
): number {
  const d = Number.isFinite(discount) ? Math.max(0, discount) : 0;
  return roundMoney(Math.max(0, lineSubtotal(quantity, unitPrice) - d));
}

/** Total da linha para exibição: líquido + IPI (ICMS informativo). */
export function lineDisplayTotal(
  quantity: number,
  unitPrice: number,
  ipiValue: number,
  discount = 0
): number {
  return roundMoney(
    lineNetSubtotal(quantity, unitPrice, discount) + Number(ipiValue ?? 0)
  );
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
 * Regra: IPI sobre líquido (após desconto); base ICMS = líquido + IPI; ICMS sobre a base.
 * Ao editar valor manualmente (mode "none"), mantém o valor informado.
 */
export function recalcLineTaxAmounts(
  quantity: number,
  unitPrice: number,
  fields: PurchaseLineTaxFields,
  mode: RecalcTaxMode = "both",
  discount = 0
): PurchaseLineTaxFields {
  const subtotal = lineNetSubtotal(quantity, unitPrice, discount);

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
  discount?: number;
}): PurchaseLineTaxFields {
  const subtotal = lineNetSubtotal(
    line.quantity,
    line.unitPrice,
    line.discount ?? 0
  );
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
    discount?: number;
    icmsValue?: number;
    ipiValue?: number;
    taxBase?: number;
  }>
): {
  subtotal: number;
  totalIcms: number;
  totalIpi: number;
  totalTaxBase: number;
  totalDiscount: number;
} {
  let subtotal = 0;
  let totalIcms = 0;
  let totalIpi = 0;
  let totalTaxBase = 0;
  let totalDiscount = 0;

  for (const line of lines) {
    const discount = Number.isFinite(line.discount)
      ? Math.max(0, Number(line.discount))
      : 0;
    const lineSub = lineNetSubtotal(line.quantity, line.unitPrice, discount);
    const ipiVal = roundMoney(Number(line.ipiValue ?? 0));
    const base =
      line.taxBase !== undefined && Number.isFinite(line.taxBase)
        ? roundMoney(line.taxBase)
        : roundMoney(lineSub + ipiVal);

    subtotal += lineSub;
    totalDiscount += discount;
    totalIcms += roundMoney(Number(line.icmsValue ?? 0));
    totalIpi += ipiVal;
    totalTaxBase += base;
  }

  return {
    subtotal: roundMoney(subtotal),
    totalIcms: roundMoney(totalIcms),
    totalIpi: roundMoney(totalIpi),
    totalTaxBase: roundMoney(totalTaxBase),
    totalDiscount: roundMoney(totalDiscount),
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
