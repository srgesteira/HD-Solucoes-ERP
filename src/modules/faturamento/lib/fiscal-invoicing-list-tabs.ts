export const FISCAL_INVOICING_LIST_TABS = [
  "all",
  "ready",
  "waiting",
  "fiscal_pending",
  "nfe_active",
  "nfe_authorized",
  "nfe_error",
] as const;

export type FiscalInvoicingListTab = (typeof FISCAL_INVOICING_LIST_TABS)[number];

export function isFiscalInvoicingListTab(v: string): v is FiscalInvoicingListTab {
  return (FISCAL_INVOICING_LIST_TABS as readonly string[]).includes(v);
}

export const FISCAL_INVOICING_LIST_TAB_LABELS: Record<
  FiscalInvoicingListTab,
  string
> = {
  all: "Todos",
  ready: "Prontos para emitir",
  waiting: "Aguardando liberação",
  fiscal_pending: "Fiscal pendente",
  nfe_active: "NF-e em curso",
  nfe_authorized: "NF-e autorizadas",
  nfe_error: "Com erro",
};

export const FISCAL_INVOICING_LIST_TAB_DEFAULT: FiscalInvoicingListTab = "ready";

/** Pedidos visíveis no cronograma de faturamento fiscal. */
export const FISCAL_INVOICING_ORDER_STATUSES = [
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
] as const;

export const FISCAL_READY_STATUSES = [
  "rules_applied",
  "manual_override",
  "approved",
] as const;
