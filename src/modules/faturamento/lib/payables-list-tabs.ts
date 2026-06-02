export const PAYABLES_LIST_TABS = ["open", "forecast", "paid", "all"] as const;

export type PayablesListTab = (typeof PAYABLES_LIST_TABS)[number];

export function isPayablesListTab(v: string): v is PayablesListTab {
  return (PAYABLES_LIST_TABS as readonly string[]).includes(v);
}

export const PAYABLES_LIST_TAB_LABELS: Record<PayablesListTab, string> = {
  open: "Em aberto",
  forecast: "Previsão de pagamentos",
  paid: "Pagamentos executados",
  all: "Todos",
};

export const PAYABLES_LIST_TAB_DEFAULT: PayablesListTab = "open";
