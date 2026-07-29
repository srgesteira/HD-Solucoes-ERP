import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  addBusinessDays,
  countBusinessDaysFromDate,
  type CompanyHolidayForBusiness,
} from "@/shared/utils/date";
import {
  inferDeliveryBusinessDaysFromQuote,
  parseDeliveryBusinessDaysFromLabel,
} from "@/modules/vendas/lib/sales/quote-delivery";

type Admin = SupabaseClient<Database>;

/** Data-base dos vencimentos: faturamento/entrega real → prazo prometido → data do pedido. */
export function paymentScheduleBaseDate(order: {
  actual_delivery?: string | null;
  expected_delivery?: string | null;
  order_date: string;
}): string {
  const actual = order.actual_delivery?.trim().slice(0, 10);
  if (actual && /^\d{4}-\d{2}-\d{2}$/.test(actual)) return actual;
  const expected = order.expected_delivery?.trim().slice(0, 10);
  if (expected && /^\d{4}-\d{2}-\d{2}$/.test(expected)) return expected;
  return order.order_date.slice(0, 10);
}

/**
 * Dias úteis de lead time de entrega do ORC ligado ao PV
 * (ou distância actual order_date → expected_delivery).
 */
export async function resolveSalesOrderDeliveryLeadBusinessDays(
  admin: Admin,
  tenantId: string,
  order: {
    quote_id?: string | null;
    order_date: string;
    expected_delivery?: string | null;
  },
  holidays: CompanyHolidayForBusiness[] = []
): Promise<number> {
  if (order.quote_id) {
    const { data: quote } = await admin
      .from("quotes")
      .select("delivery_deadline, expected_delivery_date, quote_date")
      .eq("id", order.quote_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (quote) {
      const fromLabel = parseDeliveryBusinessDaysFromLabel(
        quote.delivery_deadline
      );
      if (fromLabel != null) return fromLabel;

      const inferred = inferDeliveryBusinessDaysFromQuote(quote, holidays);
      const n = parseInt(inferred, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
  }

  const od = order.order_date.slice(0, 10);
  const ed = order.expected_delivery?.trim().slice(0, 10);
  if (
    od &&
    ed &&
    /^\d{4}-\d{2}-\d{2}$/.test(od) &&
    /^\d{4}-\d{2}-\d{2}$/.test(ed)
  ) {
    const n = countBusinessDaysFromDate(od, ed, holidays);
    if (n >= 1) return n;
  }

  return 30;
}

/** Prazo de entrega a partir da confirmação do pedido (dias úteis). */
export function computeExpectedDeliveryFromConfirmation(
  confirmationDateIso: string,
  leadBusinessDays: number,
  holidays: CompanyHolidayForBusiness[] = []
): string {
  const base = confirmationDateIso.slice(0, 10);
  const days = Math.max(1, Math.trunc(leadBusinessDays));
  return addBusinessDays(base, days, holidays);
}
