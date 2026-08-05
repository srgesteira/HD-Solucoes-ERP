import type { Tables } from "@/modules/core/types/database";
import {
  quoteLineItemCode,
  quoteLineItemName,
  type QuotePrintItem,
} from "@/modules/vendas/lib/sales/quote-display";
import { salesOrderStatusPill } from "@/modules/vendas/lib/sales/sales-order-list-display";
import { formatPaymentTermsSummary } from "@/shared/utils/payment-terms-format";
import { fmtBRL } from "@/shared/utils/format-brl";
import { formatShortDate } from "@/shared/utils/date";

export type SalesOrderPrintItem = {
  id: string;
  description: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount?: number | null;
  total_price?: number | null;
  icms_value?: number | null;
  ipi_value?: number | null;
  item_notes?: string | null;
  product?: QuotePrintItem["product"];
};

export type SalesOrderPrintData = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  expected_delivery: string | null;
  client_name: string;
  client_document: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  customer_po_number: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
  subtotal: number;
  discount: number;
  tax: number;
  total_icms?: number | null;
  total_ipi?: number | null;
  total: number;
  notes: string | null;
  items?: SalesOrderPrintItem[] | null;
};

export type CompanySettingsRow = Tables<"company_settings">;

export {
  companyDisplayName,
  formatCompanyAddressForPrint,
} from "@/modules/vendas/lib/sales/quote-display";

export function soStatusLabel(status: string): string {
  return salesOrderStatusPill(status).label;
}

export function fmtSoDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

export function fmtSoBRL(n: number): string {
  return fmtBRL(Number.isFinite(n) ? n : 0);
}

export function soPaymentTermsText(order: SalesOrderPrintData): string {
  return formatPaymentTermsSummary({
    payment_installments: order.payment_installments,
    payment_days_to_first_due: order.payment_days_to_first_due,
    payment_days_between_installments: order.payment_days_between_installments,
  });
}

export function soItemCode(item: SalesOrderPrintItem): string {
  return quoteLineItemCode(item.product, item.description);
}

export function soItemName(item: SalesOrderPrintItem): string {
  return quoteLineItemName(item.product, item.description);
}

export function soItemLineTotal(item: SalesOrderPrintItem): number {
  if (item.total_price != null && Number.isFinite(Number(item.total_price))) {
    return Number(item.total_price);
  }
  const disc = Number(item.discount ?? 0);
  return Math.max(0, Number(item.quantity) * Number(item.unit_price) - disc);
}
