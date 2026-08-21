export const RECEIVABLES_LIST_TABS = ["open", "forecast", "paid", "all"] as const;

export type ReceivablesListTab = (typeof RECEIVABLES_LIST_TABS)[number];

export function isReceivablesListTab(v: string): v is ReceivablesListTab {
  return (RECEIVABLES_LIST_TABS as readonly string[]).includes(v);
}

export const RECEIVABLES_LIST_TAB_LABELS: Record<ReceivablesListTab, string> = {
  open: "Em aberto",
  forecast: "Previsão de recebimentos",
  paid: "Recebimentos executados",
  all: "Todos",
};

export const RECEIVABLES_LIST_TAB_DEFAULT: ReceivablesListTab = "open";
