export const FISCAL_INBOUND_LIST_TABS = [
  "to_review",
  "ready_to_receive",
  "received",
] as const;

export type FiscalInboundListTab = (typeof FISCAL_INBOUND_LIST_TABS)[number];

export function isFiscalInboundListTab(v: string): v is FiscalInboundListTab {
  return (FISCAL_INBOUND_LIST_TABS as readonly string[]).includes(v);
}

export const FISCAL_INBOUND_LIST_TAB_LABELS: Record<
  FiscalInboundListTab,
  string
> = {
  to_review: "Compras / Fiscal a conferir",
  ready_to_receive: "Pronto para concretizar",
  received: "Concretizados",
};

/** PCs visíveis no kanban de entrada (exclui draft/cancelled). */
export const FISCAL_INBOUND_ORDER_STATUSES = [
  "sent",
  "confirmed",
  "partial",
  "received",
] as const;
