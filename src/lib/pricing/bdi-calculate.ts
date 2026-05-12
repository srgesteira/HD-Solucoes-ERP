/**
 * Motor de precificação BDI (alinha-se à função SQL `calculate_selling_price`).
 */

export type BdiSettingsSlice = {
  tax_icms: number;
  tax_pis: number;
  tax_cofins: number;
  tax_ipi: number;
  tax_iss: number;
  admin_overhead: number;
  commercial_overhead: number;
  financial_overhead: number;
  profit_margin: number;
  use_compound_bdi: boolean;
  min_markup: number;
  max_markup: number;
};

export type BdiPriceInput = {
  cost: number;
  settings: BdiSettingsSlice;
  /** Soma efectiva dos impostos em % quando BDI personalizado */
  overrideTaxPct?: number | null;
  /** Margem desejada em % quando BDI personalizado */
  overrideProfitPct?: number | null;
};

function clampCost(cost: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return cost;
}

export function coerceNum(n: unknown, def = 0): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  const p = typeof n === "string" ? parseFloat(n) : Number(n);
  return Number.isFinite(p) ? p : def;
}

export function totalTaxPctFromSettings(s: BdiSettingsSlice): number {
  return (
    coerceNum(s.tax_icms) +
    coerceNum(s.tax_pis) +
    coerceNum(s.tax_cofins) +
    coerceNum(s.tax_ipi) +
    coerceNum(s.tax_iss)
  );
}

export function overheadDecimalSum(s: BdiSettingsSlice): number {
  return (
    (coerceNum(s.admin_overhead) +
      coerceNum(s.commercial_overhead) +
      coerceNum(s.financial_overhead)) /
    100
  );
}

/**
 * Replica `public.calculate_selling_price`.
 */
export function calculateBdiSellingPrice(input: BdiPriceInput): number {
  const cost = clampCost(input.cost);
  if (cost === 0) return 0;

  const s = input.settings;

  const totalTaxPct =
    input.overrideTaxPct !== undefined && input.overrideTaxPct !== null
      ? coerceNum(input.overrideTaxPct)
      : totalTaxPctFromSettings(s);

  const profitPct =
    input.overrideProfitPct !== undefined && input.overrideProfitPct !== null
      ? coerceNum(input.overrideProfitPct)
      : coerceNum(s.profit_margin);

  const overheads = overheadDecimalSum(s);
  const useCompound =
    typeof s.use_compound_bdi === "boolean"
      ? s.use_compound_bdi
      : Boolean(s.use_compound_bdi ?? true);

  let selling: number;

  if (useCompound) {
    let divisor =
      1 - (totalTaxPct / 100 + overheads + profitPct / 100);
    if (divisor <= 0) divisor = 0.01;
    selling = cost / divisor;
  } else {
    const mult =
      1 +
      totalTaxPct / 100 +
      overheads +
      profitPct / 100;
    selling = cost * mult;
  }

  const minM = coerceNum(s.min_markup);
  const maxM = coerceNum(s.max_markup);

  if (minM > 0 && selling < cost * (1 + minM / 100)) {
    selling = cost * (1 + minM / 100);
  }
  if (maxM > 0 && selling > cost * (1 + maxM / 100)) {
    selling = cost * (1 + maxM / 100);
  }

  return Math.round(selling * 100) / 100;
}

/**
 * Visão simplificada para gráficos (pool = preço − custo repartido por pesos %).
 */
export function approximateBdiBreakdown(
  cost: number,
  sellingPrice: number,
  weights: {
    taxes: number;
    admin: number;
    commercial: number;
    financial: number;
    profit: number;
  }
): Array<{ label: string; amount: number; color: string }> {
  const pool = Math.max(sellingPrice - cost, 0);
  const wSum =
    Math.max(
      coerceNum(weights.taxes, 0) +
        coerceNum(weights.admin, 0) +
        coerceNum(weights.commercial, 0) +
        coerceNum(weights.financial, 0) +
        coerceNum(weights.profit, 0),
      0
    ) || 1;

  const parts =
    pool > 0 && wSum > 0
      ? [
          {
            label: "Impostos (est.)",
            amount: pool * (coerceNum(weights.taxes, 0) / wSum),
            color: "bg-rose-400",
          },
          {
            label: "Despesas adm.",
            amount: pool * (coerceNum(weights.admin, 0) / wSum),
            color: "bg-amber-400",
          },
          {
            label: "Comercial",
            amount: pool * (coerceNum(weights.commercial, 0) / wSum),
            color: "bg-sky-400",
          },
          {
            label: "Financeiras",
            amount: pool * (coerceNum(weights.financial, 0) / wSum),
            color: "bg-violet-400",
          },
          {
            label: "Lucro (est.)",
            amount: pool * (coerceNum(weights.profit, 0) / wSum),
            color: "bg-emerald-400",
          },
        ]
      : [];

  const result: Array<{ label: string; amount: number; color: string }> = [
    {
      label: "Custo",
      amount: cost,
      color: "bg-slate-600",
    },
    ...parts,
  ];

  return result.filter((p) => p.amount > 0.000001);
}

export function defaultBdiSettings(): BdiSettingsSlice {
  return {
    tax_icms: 0,
    tax_pis: 0,
    tax_cofins: 0,
    tax_ipi: 0,
    tax_iss: 0,
    admin_overhead: 15,
    commercial_overhead: 10,
    financial_overhead: 5,
    profit_margin: 20,
    use_compound_bdi: true,
    min_markup: 0,
    max_markup: 100,
  };
}
