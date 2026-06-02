import { computeOrderProductionAggregateStatus } from "@/modules/pcp/lib/order-item-production-status";
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
    const agg = computeOrderProductionAggregateStatus(
      order.items.map((it) => ({
        production_start: it.production_start,
        production_end: it.production_end,
        status: it.production_status,
        completed_at: it.production_completed_at,
      }))
    );
    if (tab === "finished") return agg === "finished";
    return agg !== "finished";
  });
}
