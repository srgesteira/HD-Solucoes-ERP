import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { countPurchaseRequisitions } from "@/modules/compras/lib/purchasing-requisitions";
import { ENGINEERING_STATUS_PENDING } from "@/modules/engenharia/lib/products/engineering-workflow";

/** Caminhos do menu lateral com contador de actividade em aberto. */
export const MENU_ALERT_PATHS = {
  purchasingOrders: "/purchasing/orders",
  products: "/products",
  pcpPlanning: "/logistics/pcp",
  financePayables: "/finance/payables",
  financeReceivables: "/finance/receivables",
  financeCreditAnalysis: "/finance/credit-analysis",
  financeOverdueReceivables: "/reports/overdue-receivables",
  salesQuotes: "/sales/quotes",
  salesOrders: "/sales/orders",
} as const;

export type MenuAlertPath =
  (typeof MENU_ALERT_PATHS)[keyof typeof MENU_ALERT_PATHS];

export type MenuAlertsMap = Record<string, number>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadMenuAlerts(
  admin: SupabaseClient<Database>,
  tenantId: string,
  access: {
    compras: boolean;
    engenharia: boolean;
    faturamento: boolean;
    vendas: boolean;
    pcp: boolean;
  }
): Promise<MenuAlertsMap> {
  const alerts: MenuAlertsMap = {};
  const today = todayIso();

  const tasks: Promise<void>[] = [];

  if (access.compras) {
    tasks.push(
      countPurchaseRequisitions(admin, tenantId).then((n) => {
        if (n > 0) alerts[MENU_ALERT_PATHS.purchasingOrders] = n;
      })
    );
  }

  if (access.engenharia) {
    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("engineering_workflow_status", ENGINEERING_STATUS_PENDING);
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.products] = count ?? 0;
        }
      })()
    );
  }

  if (access.faturamento) {
    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("accounts_payable")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "overdue"])
          .lte("due_date", today);
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.financePayables] = count ?? 0;
        }
      })()
    );

    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("receivables")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "partial"])
          .lte("due_date", today);
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.financeReceivables] = count ?? 0;
        }
      })()
    );

    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("receivables")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "partial"])
          .lt("due_date", today);
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.financeOverdueReceivables] = count ?? 0;
        }
      })()
    );

    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("credit_analysis")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending");
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.financeCreditAnalysis] = count ?? 0;
        }
      })()
    );

    tasks.push(
      (async () => {
        const { count: readyCount, error: readyErr } = await admin
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("ready_for_invoice", true)
          .eq("status", "confirmed")
          .in("fiscal_status", [
            "rules_applied",
            "manual_override",
            "approved",
          ]);
        const { count: reviewCount, error: reviewErr } = await admin
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("fiscal_status", "review_required")
          .in("status", ["confirmed", "in_production"]);
        const { count: nfeErrCount, error: nfeErr } = await admin
          .from("nfes")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "error");
        const total =
          (readyErr ? 0 : (readyCount ?? 0)) +
          (reviewErr ? 0 : (reviewCount ?? 0)) +
          (nfeErr ? 0 : (nfeErrCount ?? 0));
        if (total > 0) {
          alerts[MENU_ALERT_PATHS.salesOrders] = total;
        }
      })()
    );
  }

  if (access.vendas) {
    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("quotes")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("awaiting_commercial_finalize", true);
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.salesQuotes] = count ?? 0;
        }
      })()
    );
  }

  if (access.pcp) {
    tasks.push(
      (async () => {
        const { count, error } = await admin
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("mrp_processed", false)
          .in("status", ["pending", "confirmed", "in_production"]);
        if (!error && (count ?? 0) > 0) {
          alerts[MENU_ALERT_PATHS.pcpPlanning] = count ?? 0;
        }
      })()
    );
  }

  await Promise.all(tasks);
  return alerts;
}

/** Soma alertas dos filhos de um grupo (propaga para o título do grupo). */
export function groupAlertTotal(
  childHrefs: string[],
  alerts: MenuAlertsMap
): number {
  return childHrefs.reduce((sum, href) => sum + (alerts[href] ?? 0), 0);
}
