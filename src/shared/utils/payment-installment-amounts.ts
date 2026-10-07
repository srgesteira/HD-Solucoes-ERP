/** Reparte e valida valores das parcelas (sinal + saldo, % livre, etc.). */

export function roundInstallmentMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Total cobrado na NF-e / duplicata: mercadoria + frete informado na nota. */
export function paymentTotalWithFreight(
  goodsTotal: number,
  freightCost?: number | null
): number {
  return roundInstallmentMoney(
    Math.max(0, Number(goodsTotal) || 0) +
      Math.max(0, Number(freightCost) || 0)
  );
}

/** Reparte o total em N parcelas iguais (centavos) sem erro de soma. */
export function splitAmountInInstallments(total: number, nRaw: number): number[] {
  const n = Math.max(1, Math.min(999, Math.floor(Number(nRaw)) || 1));
  const t = roundInstallmentMoney(Math.max(0, Number(total) || 0));
  if (n <= 1) return [t];
  const cents = Math.round(t * 100);
  const baseCents = Math.floor(cents / n);
  const remainder = cents - baseCents * n;
  const parts: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = i < remainder ? 1 : 0;
    parts.push((baseCents + extra) / 100);
  }
  return parts;
}

export function parseInstallmentAmountsRaw(raw: unknown): number[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  const nums: number[] = [];
  for (const v of raw) {
    let n: number;
    if (typeof v === "number") n = v;
    else if (typeof v === "string") {
      const trimmed = v.trim().replace(",", ".");
      if (!trimmed) return null;
      n = parseFloat(trimmed);
    } else {
      return null;
    }
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(roundInstallmentMoney(n));
  }
  return nums;
}

/** Array persistido (`[]` = parcelas iguais). */
export function storedInstallmentAmounts(raw: unknown): number[] {
  return parseInstallmentAmountsRaw(raw) ?? [];
}

/**
 * Valores efectivos das N parcelas. Array vazio / inválido = divisão igual.
 * A última parcela fecha o total para NF-e e financeiro coincidirem.
 */
export function resolveInstallmentAmounts(
  total: number,
  nRaw: number,
  custom?: number[] | null
): number[] {
  const n = Math.max(1, Math.min(999, Math.floor(Number(nRaw)) || 1));
  const t = roundInstallmentMoney(Math.max(0, Number(total) || 0));
  const equal = splitAmountInInstallments(t, n);
  if (!custom || custom.length !== n) return equal;
  const cleaned = custom.map((v) => roundInstallmentMoney(Number(v)));
  if (cleaned.some((v) => !Number.isFinite(v) || v < 0)) return equal;
  if (n === 1) return [t];
  const head = cleaned.slice(0, -1);
  const used = roundInstallmentMoney(head.reduce((a, b) => a + b, 0));
  const last = roundInstallmentMoney(t - used);
  if (last < 0) return equal;
  return [...head, last];
}

export function amountsAreEqualSplit(
  amounts: number[] | null | undefined,
  total: number,
  n: number
): boolean {
  if (!amounts || amounts.length === 0) return true;
  if (amounts.length !== n) return false;
  const equal = splitAmountInInstallments(total, n);
  return amounts.every(
    (v, i) => Math.abs(roundInstallmentMoney(v) - equal[i]) < 0.015
  );
}

export function applyInstallmentAmountEdit(
  amounts: number[],
  index: number,
  value: number,
  total: number
): number[] {
  const n = Math.max(1, amounts.length);
  const t = roundInstallmentMoney(Math.max(0, Number(total) || 0));
  const next = amounts.map((v) => roundInstallmentMoney(v));
  next[index] = roundInstallmentMoney(Math.max(0, Number(value) || 0));
  if (n > 1 && index < n - 1) {
    const used = roundInstallmentMoney(
      next.slice(0, n - 1).reduce((a, b) => a + b, 0)
    );
    next[n - 1] = roundInstallmentMoney(t - used);
  }
  return next;
}

export function applyInstallmentPercentEdit(
  amounts: number[],
  index: number,
  percent: number,
  total: number
): number[] {
  const t = roundInstallmentMoney(Math.max(0, Number(total) || 0));
  const pct = Number.isFinite(percent) ? Math.max(0, percent) : 0;
  const value = roundInstallmentMoney((t * pct) / 100);
  return applyInstallmentAmountEdit(amounts, index, value, t);
}

export function installmentAmountsFromBody(
  b: Record<string, unknown>,
  nRaw: number
):
  | { ok: true; payment_installment_amounts?: number[] }
  | { ok: false; message: string } {
  if (b.payment_installment_amounts === undefined) return { ok: true };
  const n = Math.max(1, Math.min(999, Math.floor(Number(nRaw)) || 1));
  const parsed = parseInstallmentAmountsRaw(b.payment_installment_amounts);
  if (parsed === null) {
    return { ok: false, message: "Valores das parcelas inválidos." };
  }
  if (parsed.length === 0) {
    return { ok: true, payment_installment_amounts: [] };
  }
  if (parsed.length !== n) {
    return {
      ok: false,
      message: `Indique ${n} valor(es) de parcela (um por parcela).`,
    };
  }
  return { ok: true, payment_installment_amounts: parsed };
}
