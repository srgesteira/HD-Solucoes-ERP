import type { SalesOrderStatus } from "@/lib/types/sales.types";
import type { SalesOrderProductionSituation } from "@/lib/sales/sales-order-production-summary";

export const SALES_ORDER_LIST_TABS = [
  "open",
  "finished",
  "cancelled",
  "ready",
] as const;

export type SalesOrderListTab = (typeof SALES_ORDER_LIST_TABS)[number];

export function isSalesOrderListTab(v: string): v is SalesOrderListTab {
  return (SALES_ORDER_LIST_TABS as readonly string[]).includes(v);
}

export const SALES_ORDER_LIST_TAB_LABELS: Record<SalesOrderListTab, string> = {
  open: "Em aberto",
  finished: "Finalizados",
  cancelled: "Cancelados",
  ready: "Liberados para faturar",
};

export function salesOrderStatusPill(status: string): {
  label: string;
  className: string;
} {
  switch (status as SalesOrderStatus) {
    case "pending":
      return {
        label: "Pendente",
        className:
          "bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        className:
          "bg-blue-50 text-blue-950 ring-1 ring-blue-200 dark:bg-blue-950/45 dark:text-blue-100",
      };
    case "in_production":
      return {
        label: "Em produção",
        className:
          "bg-violet-50 text-violet-950 ring-1 ring-violet-200 dark:bg-violet-950/45 dark:text-violet-100",
      };
    case "shipped":
      return {
        label: "Expedido",
        className:
          "bg-orange-50 text-orange-950 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-100",
      };
    case "delivered":
      return {
        label: "Entregue",
        className:
          "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        className:
          "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100",
      };
    default:
      return {
        label: status,
        className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
      };
  }
}

export function productionSituationPill(situation: SalesOrderProductionSituation): {
  label: string;
  className: string;
} {
  switch (situation) {
    case "scheduled":
      return {
        label: "Programado",
        className:
          "bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800/80 dark:text-slate-200",
      };
    case "producing":
      return {
        label: "Produzindo",
        className:
          "bg-green-50 text-green-900 ring-green-200 dark:bg-green-950/35 dark:text-green-100",
      };
    case "ready":
      return {
        label: "Pronto",
        className:
          "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100",
      };
    default:
      return {
        label: "—",
        className: "text-slate-400",
      };
  }
}

export function formatSalesListDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
