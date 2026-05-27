import type { Tables } from "@/modules/core/types/database";
import type { QuoteStatus } from "@/modules/core/types/sales.types";

export function fmtQuoteBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(n ?? 0));
}

export function fmtQuoteDay(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function quoteStatusBadge(status: string): {
  label: string;
  className: string;
} {
  switch (status as QuoteStatus) {
    case "draft":
      return {
        label: "Rascunho",
        className:
          "bg-slate-100 text-slate-800 ring-1 ring-slate-300 print:ring-slate-400",
      };
    case "sent":
      return {
        label: "Enviado",
        className: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
      };
    case "approved":
      return {
        label: "Aprovado",
        className: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200",
      };
    case "rejected":
      return {
        label: "Rejeitado",
        className: "bg-red-50 text-red-900 ring-1 ring-red-200",
      };
    case "converted":
      return {
        label: "Convertido",
        className: "bg-blue-50 text-blue-900 ring-1 ring-blue-200",
      };
    case "revision":
      return {
        label: "Em revisão",
        className:
          "bg-orange-50 text-orange-900 ring-1 ring-orange-200 print:ring-orange-300",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

export type QuotePrintCustomer = {
  name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
} | null;

export type QuotePrintProduct = {
  name?: string | null;
  technical_code?: string | null;
  code?: string | null;
};

export type QuotePrintItem = {
  id: string;
  description: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  markup_percent?: number | null;
  total_price: number;
  product?: QuotePrintProduct | QuotePrintProduct[] | null;
};

export type QuotePrintData = {
  quote_number: string;
  status: string;
  quote_date: string;
  valid_until: string | null;
  validity_days: number | null;
  payment_terms: string | null;
  delivery_deadline: string | null;
  shipping_type: string | null;
  created_at: string;
  client_name: string;
  client_email: string | null;
  customer?: QuotePrintCustomer | QuotePrintCustomer[];
  notes: string | null;
  revision_notes?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  items?: QuotePrintItem[] | null;
};

export function unwrapQuoteCustomer(
  customer: QuotePrintData["customer"],
  clientName: string
): QuotePrintCustomer {
  const c = Array.isArray(customer) ? customer[0] : customer;
  if (c?.name) return c;
  return { name: clientName };
}

export function unwrapQuoteProductName(
  p: QuotePrintItem["product"]
): string {
  if (p == null) return "—";
  const o = Array.isArray(p) ? p[0] : p;
  const n = o?.name;
  return typeof n === "string" && n.trim() ? n : "—";
}

export function unwrapQuoteProductCode(
  p: QuotePrintItem["product"]
): string {
  if (p == null) return "—";
  const o = Array.isArray(p) ? p[0] : p;
  const code = o?.technical_code?.trim() || o?.code?.trim();
  return code || "—";
}

/** Texto extra de descrição na impressão (null = não exibir sob o produto). */
export function quoteItemPrintDescription(
  description: string | null | undefined,
  product: QuotePrintItem["product"]
): string | null {
  const code = unwrapQuoteProductCode(product);
  const name = unwrapQuoteProductName(product);
  const raw = description?.trim() ?? "";

  if (!raw) return null;

  const defaults = new Set<string>();
  if (code !== "—" && name !== "—") {
    defaults.add(`${code} — ${name}`);
    defaults.add(`${code} - ${name}`);
  }
  if (name !== "—") defaults.add(name);
  if (defaults.has(raw)) return null;

  let text = raw;
  if (code !== "—") {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = raw.replace(new RegExp(`^${escaped}\\s*[—\\-]\\s*`, "i"), "").trim();
  }

  if (!text || text === name) return null;
  return text;
}

export function formatCompanyAddressForPrint(
  s: Tables<"company_settings">
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

export function companyDisplayName(s: Tables<"company_settings">): string {
  return s.trade_name?.trim() || s.company_name || "Empresa";
}
