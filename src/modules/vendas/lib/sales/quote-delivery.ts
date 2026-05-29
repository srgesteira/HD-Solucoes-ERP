import {
  addBusinessDays,
  countBusinessDaysFromDate,
  type CompanyHolidayForBusiness,
} from "@/shared/utils/date";

export function formatDeliveryBusinessDaysLabel(days: number): string {
  if (days === 1) return "1 dia útil";
  return `${days} dias úteis`;
}

/** Extrai dias úteis de `delivery_deadline` gravado como "N dias úteis". */
export function parseDeliveryBusinessDaysFromLabel(
  raw: string | null | undefined
): number | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d+)\s*dias?\s*úteis/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function inferDeliveryBusinessDaysFromQuote(
  quote: {
    delivery_deadline?: string | null;
    expected_delivery_date?: string | null;
    quote_date?: string | null;
  },
  holidays: CompanyHolidayForBusiness[] = []
): string {
  const fromLabel = parseDeliveryBusinessDaysFromLabel(
    quote.delivery_deadline
  );
  if (fromLabel != null) return String(fromLabel);

  const qd = quote.quote_date?.trim().slice(0, 10);
  const ed = quote.expected_delivery_date?.trim().slice(0, 10);
  if (qd && ed && /^\d{4}-\d{2}-\d{2}$/.test(qd) && /^\d{4}-\d{2}-\d{2}$/.test(ed)) {
    const n = countBusinessDaysFromDate(qd, ed, holidays);
    if (n >= 1) return String(n);
  }

  return "";
}

export type ResolvedQuoteDelivery = {
  expected_delivery_date: string | null;
  delivery_deadline: string | null;
};

export function resolveQuoteDeliveryFromBody(
  b: Record<string, unknown>,
  quoteDate: string,
  holidays: CompanyHolidayForBusiness[] = []
): ResolvedQuoteDelivery | { error: string } {
  let businessDays: number | null = null;

  if (
    b.delivery_business_days !== undefined &&
    b.delivery_business_days !== null &&
    b.delivery_business_days !== ""
  ) {
    const v =
      typeof b.delivery_business_days === "number"
        ? b.delivery_business_days
        : parseInt(String(b.delivery_business_days).trim(), 10);
    if (!Number.isFinite(v) || v < 1) {
      return { error: "Prazo de entrega em dias úteis inválido." };
    }
    businessDays = v;
  } else if (b.delivery_deadline !== undefined && b.delivery_deadline !== null) {
    const legacy = String(b.delivery_deadline).trim();
    const fromLabel = parseDeliveryBusinessDaysFromLabel(legacy);
    if (fromLabel != null) {
      businessDays = fromLabel;
    } else {
      const m = legacy.match(/^(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n >= 1) businessDays = n;
      }
    }
  }

  if (businessDays == null) {
    return { expected_delivery_date: null, delivery_deadline: null };
  }

  const qd = quoteDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(qd)) {
    return { error: "Data do orçamento inválida para calcular entrega." };
  }

  return {
    expected_delivery_date: addBusinessDays(qd, businessDays, holidays),
    delivery_deadline: formatDeliveryBusinessDaysLabel(businessDays),
  };
}
