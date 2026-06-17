import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { countPurchaseRequisitions } from "@/modules/compras/lib/purchasing-requisitions";
import { ENGINEERING_STATUS_PENDING } from "@/modules/engenharia/lib/products/engineering-workflow";
import { loadDataHealthIssues } from "@/modules/core/lib/data-health/data-health";
import { loadOnboardingState } from "@/modules/core/lib/onboarding/onboarding-state";

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
  dataHealth: "/data-health",
  onboarding: "/onboarding",
} as const;

export type MenuAlertPath =
  (typeof MENU_ALERT_PATHS)[keyof typeof MENU_ALERT_PATHS];

/**
 * Hierarquia de urgência (§11.3 do documento funcional).
 * `urgent`: vermelho com pulse — vence hoje, atrasado, trava produção.
 * `attention`: âmbar estático — pendente mas com folga.
 * `info`: cinza — apenas contagem informativa.
 */
export type MenuAlertLevel = "urgent" | "attention" | "info";

export type MenuAlertEntry = {
  count: number;
  level: MenuAlertLevel;
};

export type MenuAlertsMap = Record<string, MenuAlertEntry>;

const LEVEL_RANK: Record<MenuAlertLevel, number> = {
  info: 0,
  attention: 1,
  urgent: 2,
};

function maxLevel(a: MenuAlertLevel, b: MenuAlertLevel): MenuAlertLevel {
  return LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Soma uma contribuição ao alerta de um caminho, elevando o nível se necessário. */
function pushAlert(
  alerts: MenuAlertsMap,
  href: string,
  count: number,
  level: MenuAlertLevel
): void {
  if (!count || count <= 0) return;
  const cur = alerts[href];
  if (!cur) {
    alerts[href] = { count, level };
    return;
  }
  cur.count += count;
  cur.level = maxLevel(cur.level, level);
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
        pushAlert(alerts, MENU_ALERT_PATHS.purchasingOrders, n, "attention");
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
        if (!error) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.products,
            count ?? 0,
            "attention"
          );
        }
      })()
    );
  }

  if (access.faturamento) {
    tasks.push(
      (async () => {
        // Contas a pagar VENCIDAS — urgente.
        const { count: overdue, error: e1 } = await admin
          .from("accounts_payable")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "overdue"])
          .lt("due_date", today);
        if (!e1) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.financePayables,
            overdue ?? 0,
            "urgent"
          );
        }
        // Contas a pagar VENCENDO HOJE — atenção.
        const { count: today_, error: e2 } = await admin
          .from("accounts_payable")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "overdue"])
          .eq("due_date", today);
        if (!e2) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.financePayables,
            today_ ?? 0,
            "attention"
          );
        }
      })()
    );

    tasks.push(
      (async () => {
        // Recebíveis VENCENDO HOJE — atenção (não conta os já vencidos, que ficam no overdue).
        const { count, error } = await admin
          .from("receivables")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "partial"])
          .eq("due_date", today);
        if (!error) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.financeReceivables,
            count ?? 0,
            "attention"
          );
        }
      })()
    );

    tasks.push(
      (async () => {
        // Recebíveis VENCIDOS — urgente.
        const { count, error } = await admin
          .from("receivables")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "partial"])
          .lt("due_date", today);
        if (!error) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.financeOverdueReceivables,
            count ?? 0,
            "urgent"
          );
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
        if (!error) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.financeCreditAnalysis,
            count ?? 0,
            "attention"
          );
        }
      })()
    );

    tasks.push(
      (async () => {
        // Pedidos prontos para faturar (produção concluiu + fiscal OK) — atenção.
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
        if (!readyErr) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.salesOrders,
            readyCount ?? 0,
            "attention"
          );
        }
        // §7.1: pedidos efetivados com fiscal por conferir desde já,
        // mesmo antes de a produção concluir. Atenção (não urgente),
        // pois há tempo enquanto a produção roda.
        const { count: pendingFiscalCount, error: pendingErr } = await admin
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "confirmed", "in_production"])
          .in("fiscal_status", ["pending", "no_rules"]);
        if (!pendingErr) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.salesOrders,
            pendingFiscalCount ?? 0,
            "attention"
          );
        }
        // Pedidos com fiscal pedindo revisão — urgente (algo travou o motor).
        const { count: reviewCount, error: reviewErr } = await admin
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("fiscal_status", "review_required")
          .in("status", ["pending", "confirmed", "in_production"]);
        if (!reviewErr) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.salesOrders,
            reviewCount ?? 0,
            "urgent"
          );
        }
        // NF-e em erro — urgente.
        const { count: nfeErrCount, error: nfeErr } = await admin
          .from("nfes")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "error");
        if (!nfeErr) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.salesOrders,
            nfeErrCount ?? 0,
            "urgent"
          );
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
        if (!error) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.salesQuotes,
            count ?? 0,
            "attention"
          );
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
        if (!error) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.pcpPlanning,
            count ?? 0,
            "attention"
          );
        }
      })()
    );
  }

  // §13 — saúde do dado: bloqueios viram urgente; warnings viram atenção.
  tasks.push(
    (async () => {
      try {
        const issues = await loadDataHealthIssues(admin, tenantId);
        const blockers = issues.filter((i) => i.severity === "blocker").length;
        const warnings = issues.filter((i) => i.severity === "warning").length;
        if (blockers > 0) {
          pushAlert(alerts, MENU_ALERT_PATHS.dataHealth, blockers, "urgent");
        }
        if (warnings > 0) {
          pushAlert(alerts, MENU_ALERT_PATHS.dataHealth, warnings, "attention");
        }
      } catch {
        /* ignora — não pode bloquear o menu */
      }
    })()
  );

  // §16 — onboarding: blockers pendentes viram urgent, recomendados viram info.
  tasks.push(
    (async () => {
      try {
        const onboarding = await loadOnboardingState(admin, tenantId);
        const pendingBlockers = onboarding.items.filter(
          (i) => i.severity === "blocker" && !i.done
        ).length;
        const pendingRecommended = onboarding.items.filter(
          (i) => i.severity === "recommended" && !i.done
        ).length;
        if (pendingBlockers > 0) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.onboarding,
            pendingBlockers,
            "urgent"
          );
        } else if (pendingRecommended > 0) {
          pushAlert(
            alerts,
            MENU_ALERT_PATHS.onboarding,
            pendingRecommended,
            "info"
          );
        }
      } catch {
        /* ignora */
      }
    })()
  );

  await Promise.all(tasks);
  return alerts;
}

/** Soma alertas dos filhos de um grupo (propaga para o título do grupo). */
export function groupAlertTotal(
  childHrefs: string[],
  alerts: MenuAlertsMap
): MenuAlertEntry {
  let count = 0;
  let level: MenuAlertLevel = "info";
  for (const href of childHrefs) {
    const e = alerts[href];
    if (!e) continue;
    count += e.count;
    level = maxLevel(level, e.level);
  }
  return { count, level };
}
