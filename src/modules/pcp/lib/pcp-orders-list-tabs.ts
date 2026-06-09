import { isOrderPcpClosed } from "@/modules/pcp/lib/pcp-order-display";
import type { PcpPlanningOrder } from "@/modules/pcp/lib/pcp-planning";

export const PCP_ORDERS_LIST_TABS = ["open", "finished", "all"] as const;

export type PcpOrdersListTab = (typeof PCP_ORDERS_LIST_TABS)[number];

export const PCP_ORDERS_LIST_TAB_LABELS: Record<PcpOrdersListTab, string> = {
  open: "Em aberto",
  finished: "Finalizadas",
  all: "Todas",
};

export const PCP_ORDERS_LIST_TAB_DEFAULT: PcpOrdersListTab = "open";

export function filterPcpOrdersByTab(
  orders: PcpPlanningOrder[],
  tab: PcpOrdersListTab
): PcpPlanningOrder[] {
  if (tab === "all") return orders;
  return orders.filter((order) => {
    const closed = isOrderPcpClosed(order);
    if (tab === "finished") return closed;
    return !closed;
  });
}
