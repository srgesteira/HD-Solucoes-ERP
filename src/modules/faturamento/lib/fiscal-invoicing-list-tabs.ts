export const FISCAL_INVOICING_LIST_TABS = [
  "all",
  "fiscal_pending",
  "waiting",
  "ready",
  "nfe_active",
  "nfe_error",
  "nfe_authorized",
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
  fiscal_pending: "Fiscal pendente",
  waiting: "Aguardando liberação",
  ready: "Prontos para emitir",
  nfe_active: "Nota em curso",
  nfe_error: "Com erro",
  nfe_authorized: "Autorizadas",
};

export const FISCAL_INVOICING_LIST_TAB_DEFAULT: FiscalInvoicingListTab =
  "fiscal_pending";

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
