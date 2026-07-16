export const FISCAL_INBOUND_LIST_TABS = [
  "open",
  "received",
  "finalized",
] as const;

export type FiscalInboundListTab = (typeof FISCAL_INBOUND_LIST_TABS)[number];

export function isFiscalInboundListTab(v: string): v is FiscalInboundListTab {
  return (FISCAL_INBOUND_LIST_TABS as readonly string[]).includes(v);
}

export const FISCAL_INBOUND_LIST_TAB_LABELS: Record<
  FiscalInboundListTab,
  string
> = {
  open: "Em aberto",
  received: "Recebido",
  finalized: "Finalizado",
};

/** PCs visíveis no kanban de entrada (exclui draft/cancelled). */
export const FISCAL_INBOUND_ORDER_STATUSES = [
  "sent",
  "confirmed",
  "partial",
  "received",
] as const;

/** Status de PC ainda em pré-conferência (antes do receive em Compras). */
export const FISCAL_INBOUND_OPEN_STATUSES = [
  "sent",
  "confirmed",
  "partial",
] as const;
