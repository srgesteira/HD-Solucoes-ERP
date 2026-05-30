import type { QuoteInsert, QuoteUpdate } from "@/modules/core/types/sales.types";
import { parsePaymentInt } from "@/modules/vendas/lib/sales/payment-fields";
import { parsePaymentTermsFromText } from "@/modules/vendas/lib/sales/parse-payment-terms";
import { resolveQuoteDeliveryFromBody } from "@/modules/vendas/lib/sales/quote-delivery";
import {
  computeValidUntil,
  parseShippingType,
  parseValidityDays,
} from "@/modules/vendas/lib/sales/quote-validity";

export type ParsedQuoteHeader = {
  customer_id: string;
  client_name: string;
  client_email: string | null;
  quote_date: string;
  validity_days: number;
  valid_until: string;
  payment_terms: string | null;
  delivery_deadline: string | null;
  expected_delivery_date: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
  shipping_type: string;
  notes: string | null;
};

export type ParseQuoteHeaderResult =
  | { ok: true; data: ParsedQuoteHeader }
  | { ok: false; message: string };

export function parseQuoteHeaderFromBody(
  b: Record<string, unknown>,
  clientNameFromDb: string
): ParseQuoteHeaderResult {
  const customer_id =
    typeof b.customer_id === "string" ? b.customer_id.trim() : "";
  if (!customer_id) {
    return { ok: false, message: "Selecione um cliente." };
  }

  const quote_date =
    b.quote_date === undefined || b.quote_date === null
      ? new Date().toISOString().slice(0, 10)
      : String(b.quote_date).slice(0, 10);

  const validityParsed = parseValidityDays(b.validity_days, 30);
  if (typeof validityParsed === "object" && "error" in validityParsed) {
    return { ok: false, message: validityParsed.error };
  }
  const validity_days = validityParsed as number;

  let valid_until: string;
  try {
    valid_until = computeValidUntil(quote_date, validity_days);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Data inválida.",
    };
  }

  const shippingParsed = parseShippingType(b.shipping_type, "FOB");
  if (typeof shippingParsed === "object" && "error" in shippingParsed) {
    return { ok: false, message: shippingParsed.error };
  }

  const paymentTermsText =
    b.payment_terms === undefined || b.payment_terms === null
      ? null
      : String(b.payment_terms).trim() || null;

  const parsedPayment = paymentTermsText
    ? parsePaymentTermsFromText(paymentTermsText)
    : null;

  const pi = parsedPayment
    ? parsedPayment.installments
    : parsePaymentInt(b.payment_installments, "payment_installments", 1, 1);
  const pd1 = parsedPayment
    ? parsedPayment.daysToFirstDue
    : parsePaymentInt(b.payment_days_to_first_due, "payment_days_to_first_due", 30);
  const pdb = parsedPayment
    ? parsedPayment.daysBetweenInstallments
    : parsePaymentInt(
        b.payment_days_between_installments,
        "payment_days_between_installments",
        30
      );

  for (const x of [pi, pd1, pdb]) {
    if (typeof x === "object" && x !== null && "error" in x) {
      return { ok: false, message: (x as { error: string }).error };
    }
  }

  const deliveryResolved = resolveQuoteDeliveryFromBody(b, quote_date);
  if ("error" in deliveryResolved) {
    return { ok: false, message: deliveryResolved.error };
  }

  return {
    ok: true,
    data: {
      customer_id,
      client_name: clientNameFromDb,
      client_email:
        b.client_email === undefined || b.client_email === null
          ? null
          : String(b.client_email).trim() || null,
      quote_date,
      validity_days,
      valid_until,
      payment_terms: paymentTermsText,
      delivery_deadline: deliveryResolved.delivery_deadline,
      expected_delivery_date: deliveryResolved.expected_delivery_date,
      payment_installments: pi as number,
      payment_days_to_first_due: pd1 as number,
      payment_days_between_installments: pdb as number,
      shipping_type: shippingParsed as string,
      notes:
        b.notes === undefined || b.notes === null
          ? null
          : String(b.notes).trim() || null,
    },
  };
}

export function quoteHeaderToInsert(
  header: ParsedQuoteHeader,
  extra: Omit<
    QuoteInsert,
    keyof ParsedQuoteHeader | "tenant_id" | "quote_number" | "status"
  > & {
    tenant_id: string;
    quote_number: string;
    status?: string;
    created_by?: string | null;
    discount?: number;
    tax?: number;
  }
): QuoteInsert {
  return {
    tenant_id: extra.tenant_id,
    quote_number: extra.quote_number,
    status: extra.status ?? "draft",
    created_by: extra.created_by ?? null,
    customer_id: header.customer_id,
    client_name: header.client_name,
    client_email: header.client_email,
    quote_date: header.quote_date,
    validity_days: header.validity_days,
    valid_until: header.valid_until,
    payment_terms: header.payment_terms,
    delivery_deadline: header.delivery_deadline,
    expected_delivery_date: header.expected_delivery_date,
    payment_installments: header.payment_installments,
    payment_days_to_first_due: header.payment_days_to_first_due,
    payment_days_between_installments: header.payment_days_between_installments,
    shipping_type: header.shipping_type,
    notes: header.notes,
    ...(extra.show_product_descriptions !== undefined
      ? { show_product_descriptions: extra.show_product_descriptions }
      : {}),
    ...(extra.discount !== undefined ? { discount: extra.discount } : {}),
    ...(extra.tax !== undefined ? { tax: extra.tax } : {}),
  };
}

export function quoteHeaderToUpdate(
  header: Partial<ParsedQuoteHeader>
): QuoteUpdate {
  const u: QuoteUpdate = {};
  if (header.customer_id !== undefined) u.customer_id = header.customer_id;
  if (header.client_name !== undefined) u.client_name = header.client_name;
  if (header.client_email !== undefined) u.client_email = header.client_email;
  if (header.quote_date !== undefined) u.quote_date = header.quote_date;
  if (header.validity_days !== undefined) u.validity_days = header.validity_days;
  if (header.valid_until !== undefined) u.valid_until = header.valid_until;
  if (header.payment_terms !== undefined) u.payment_terms = header.payment_terms;
  if (header.delivery_deadline !== undefined) {
    u.delivery_deadline = header.delivery_deadline;
  }
  if (header.expected_delivery_date !== undefined) {
    u.expected_delivery_date = header.expected_delivery_date;
  }
  if (header.payment_installments !== undefined) {
    u.payment_installments = header.payment_installments;
  }
  if (header.payment_days_to_first_due !== undefined) {
    u.payment_days_to_first_due = header.payment_days_to_first_due;
  }
  if (header.payment_days_between_installments !== undefined) {
    u.payment_days_between_installments =
      header.payment_days_between_installments;
  }
  if (header.shipping_type !== undefined) u.shipping_type = header.shipping_type;
  if (header.notes !== undefined) u.notes = header.notes;
  return u;
}
