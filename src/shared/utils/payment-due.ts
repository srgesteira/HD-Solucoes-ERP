import { todayIsoSaoPaulo } from "@/shared/utils/date";
import { buildInstallmentDueDates } from "@/shared/utils/payment-terms-format";

export const PAYMENT_DUE_MODES = ["from_emission", "fixed_dates"] as const;
export type PaymentDueMode = (typeof PAYMENT_DUE_MODES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPaymentDueMode(v: unknown): v is PaymentDueMode {
  return v === "from_emission" || v === "fixed_dates";
}

export function parsePaymentDueMode(
  raw: unknown,
  fallback: PaymentDueMode = "from_emission"
): PaymentDueMode {
  return isPaymentDueMode(raw) ? raw : fallback;
}

export function normalizeIsoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.trim().slice(0, 10);
  return ISO_DATE_RE.test(d) ? d : null;
}

export function parseFixedDueDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => normalizeIsoDate(v))
    .filter((d): d is string => Boolean(d));
}

export type PaymentDueSource = {
  payment_due_mode?: string | null;
  payment_fixed_due_dates?: string[] | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
};

/**
 * Datas da duplicata / contas a receber.
 * `from_emission`: N dias a partir da emissão da NF-e (não do prazo de entrega).
 * `fixed_dates`: datas escolhidas pelo comercial / faturamento.
 */
export function resolvePaymentDueDates(
  source: PaymentDueSource,
  emissionDateIso?: string | null
): string[] {
  const n = Math.max(
    1,
    Math.min(999, Math.floor(Number(source.payment_installments)) || 1)
  );
  const mode = parsePaymentDueMode(source.payment_due_mode);
  if (mode === "fixed_dates") {
    const fixed = parseFixedDueDates(source.payment_fixed_due_dates).slice(0, n);
    if (fixed.length === n) return fixed;
  }
  const emission =
    normalizeIsoDate(emissionDateIso) ?? todayIsoSaoPaulo();
  return buildInstallmentDueDates({
    baseDateIso: emission,
    installments: n,
    daysToFirst: Number(source.payment_days_to_first_due ?? 30),
    daysBetween: Number(source.payment_days_between_installments ?? 0),
  });
}

export function prefillFixedDueDates(source: PaymentDueSource): string[] {
  return resolvePaymentDueDates(source, todayIsoSaoPaulo());
}

export function paymentDueFieldsFromBody(
  b: Record<string, unknown>,
  installments: number
):
  | { ok: true; payment_due_mode?: PaymentDueMode; payment_fixed_due_dates?: string[] }
  | { ok: false; message: string } {
  const n = Math.max(1, Math.min(999, Math.floor(installments) || 1));
  let mode: PaymentDueMode | undefined;
  if (b.payment_due_mode !== undefined) {
    if (!isPaymentDueMode(b.payment_due_mode)) {
      return { ok: false, message: "Tipo de vencimento inválido." };
    }
    mode = b.payment_due_mode;
  }
  if (b.payment_fixed_due_dates === undefined && mode === undefined) {
    return { ok: true };
  }
  const dates = parseFixedDueDates(b.payment_fixed_due_dates);
  if ((mode ?? "from_emission") === "fixed_dates") {
    if (dates.length !== n) {
      return {
        ok: false,
        message: `Indique ${n} data(s) de pagamento (uma por parcela).`,
      };
    }
  }
  return {
    ok: true,
    ...(mode ? { payment_due_mode: mode } : {}),
    ...(b.payment_fixed_due_dates !== undefined
      ? { payment_fixed_due_dates: dates }
      : {}),
  };
}
