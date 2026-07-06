import type { Tables } from "@/modules/core/types/database";
import {
  companyDisplayName,
  formatCompanyAddressForPrint,
} from "@/modules/vendas/lib/sales/quote-display";
import { computePurchaseOrderTotal } from "@/modules/compras/lib/purchasing/purchase-order-totals";

export type PurchaseOrderPrintSupplier = {
  name: string;
  code?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  legal_name?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
};

export type PurchaseOrderPrintItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  icms_rate?: number;
  icms_value?: number;
  ipi_rate?: number;
  ipi_value?: number;
  product?: {
    code?: string | null;
    technical_code?: string | null;
    name?: string | null;
  } | null;
};

export type PurchaseOrderPrintData = {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total_icms?: number;
  total_ipi?: number;
  freight_cost?: number;
  insurance_cost?: number;
  other_costs?: number;
  total_tax_non_creditable?: number;
  total: number;
  notes: string | null;
  payment_installments?: number;
  payment_days_to_first_due?: number;
  payment_days_between_installments?: number;
  supplier?: PurchaseOrderPrintSupplier | null;
  items?: PurchaseOrderPrintItem[] | null;
};

export function fmtPoBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

import { formatShortDate } from "@/shared/utils/date";

export function fmtPoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const formatted = formatShortDate(String(iso).slice(0, 10));
  return formatted === "--" ? "—" : formatted;
}

export function formatSupplierAddressForPrint(
  s: PurchaseOrderPrintSupplier
): string | null {
  const parts = [
    [s.address_street, s.address_number].filter(Boolean).join(", "),
    s.address_complement,
    s.address_neighborhood,
    [s.address_city, s.address_state].filter(Boolean).join(" — "),
    s.address_zip ? `CEP ${s.address_zip}` : null,
  ].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(" · ") : null;
}

export function poItemProductLabel(item: PurchaseOrderPrintItem): string {
  const p = item.product;
  const code = p?.technical_code?.trim() || p?.code?.trim();
  const name = p?.name?.trim() || item.description?.trim() || "—";
  if (code) return `${code} — ${name}`;
  return name;
}

export function poStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    confirmed: "Confirmado",
    partial: "Parcial",
    received: "Recebido",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

export function poComputedTotal(order: PurchaseOrderPrintData): number {
  return computePurchaseOrderTotal({
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    total_icms: order.total_icms,
    total_ipi: order.total_ipi,
    freight_cost: order.freight_cost,
    insurance_cost: order.insurance_cost,
    other_costs: order.other_costs,
    total_tax_non_creditable: order.total_tax_non_creditable,
  });
}

import { formatPaymentTermsSummary } from "@/shared/utils/payment-terms-format";

export function poPaymentTermsText(order: PurchaseOrderPrintData): string | null {
  const n = order.payment_installments ?? 1;
  if (n <= 0) return null;
  return formatPaymentTermsSummary(order);
}

export { companyDisplayName, formatCompanyAddressForPrint };
export type CompanySettingsRow = Tables<"company_settings">;
