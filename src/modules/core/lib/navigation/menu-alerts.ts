import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { countPurchaseRequisitions } from "@/modules/compras/lib/purchasing-requisitions";
import { ENGINEERING_STATUS_PENDING } from "@/modules/engenharia/lib/products/engineering-workflow";
import { loadDataHealthIssues } from "@/modules/core/lib/data-health/data-health";
import { loadOnboardingState } from "@/modules/core/lib/onboarding/onboarding-state";

/** Caminhos do menu lateral com contador de actividade em aberto. */
export const MENU_ALERT_PATHS = {
  purchasingOrders: "/purchasing/orders",
  products: "/products",
  pcpPlanning: "/logistics/pcp",
  financeContas: "/finance/contas",
  financePayables: "/finance/contas?tab=pagar",
  financePayablesOverdue: "/finance/contas?tab=pagar&overdue=1&list=all",
  financeReceivables: "/finance/contas?tab=receber",
  financeReceivablesOverdue: "/finance/contas?tab=receber&overdue=1",
  financeCreditAnalysis: "/finance/credit-analysis",
  fiscalInvoicing: "/faturamento/fiscal",
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

/** Item descritivo para o rastro de pendências dentro de cada módulo. */
export type MenuAlertDetail = {
  id: string;
  href: string;
  label: string;
  count: number;
  level: MenuAlertLevel;
};

export type MenuAlertsPayload = {
  alerts: MenuAlertsMap;
  details: MenuAlertDetail[];
};

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

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

type PushAlertOptions = {
  detailId?: string;
  detailHref?: string;
  detailLabel?: string;
};

/** Soma uma contribuição ao alerta de um caminho, elevando o nível se necessário. */
function pushAlert(
  alerts: MenuAlertsMap,
  details: MenuAlertDetail[],
  href: string,
  count: number,
  level: MenuAlertLevel,
  options?: PushAlertOptions
): void {
  if (!count || count <= 0) return;
  const cur = alerts[href];
  if (!cur) {
    alerts[href] = { count, level };
  } else {
    cur.count += count;
    cur.level = maxLevel(cur.level, level);
  }

  if (options?.detailLabel) {
    details.push({
      id: options.detailId ?? `${href}:${level}:${details.length}`,
      href: options.detailHref ?? href,
      label: options.detailLabel,
      count,
      level,
    });
  }
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
): Promise<MenuAlertsPayload> {
  const alerts: MenuAlertsMap = {};
  const details: MenuAlertDetail[] = [];
  const today = todayIso();

  const tasks: Promise<void>[] = [];

  if (access.compras) {
    tasks.push(
      countPurchaseRequisitions(admin, tenantId).then((n) => {
        pushAlert(
          alerts,
          details,
          MENU_ALERT_PATHS.purchasingOrders,
          n,
          "attention",
          {
            detailId: "purchasing.requisitions",
            detailLabel: countLabel(
              n,
              "requisição de compra pendente",
              "requisições de compra pendentes"
            ),
          }
        );
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
          const n = count ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.products,
            n,
            "attention",
            {
              detailId: "engineering.products",
              detailLabel: countLabel(
                n,
                "produto aguardando engenharia",
                "produtos aguardando engenharia"
              ),
            }
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
          .eq("is_forecast", false)
          .in("status", ["pending", "overdue"])
          .lt("due_date", today);
        if (!e1) {
          const n = overdue ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.financePayables,
            n,
            "urgent",
            {
              detailId: "finance.payables.overdue",
              detailHref: MENU_ALERT_PATHS.financePayablesOverdue,
              detailLabel: countLabel(
                n,
                "conta a pagar vencida",
                "contas a pagar vencidas"
              ),
            }
          );
        }
        // Contas a pagar VENCENDO HOJE — atenção.
        const { count: today_, error: e2 } = await admin
          .from("accounts_payable")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("is_forecast", false)
          .in("status", ["pending", "overdue"])
          .eq("due_date", today);
        if (!e2) {
          const n = today_ ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.financePayables,
            n,
            "attention",
            {
              detailId: "finance.payables.today",
              detailHref: MENU_ALERT_PATHS.financePayables,
              detailLabel: countLabel(
                n,
                "conta a pagar vence hoje",
                "contas a pagar vencem hoje"
              ),
            }
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
          .eq("is_forecast", false)
          .in("status", ["pending", "partial"])
          .eq("due_date", today);
        if (!error) {
          const n = count ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.financeReceivables,
            n,
            "attention",
            {
              detailId: "finance.receivables.today",
              detailHref: `${MENU_ALERT_PATHS.financeReceivables}&status=pending`,
              detailLabel: countLabel(
                n,
                "conta a receber vence hoje",
                "contas a receber vencem hoje"
              ),
            }
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
          .eq("is_forecast", false)
          .in("status", ["pending", "partial"])
          .lt("due_date", today);
        if (!error) {
          const n = count ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.financeReceivables,
            n,
            "urgent",
            {
              detailId: "finance.receivables.overdue",
              detailHref: MENU_ALERT_PATHS.financeReceivablesOverdue,
              detailLabel: countLabel(
                n,
                "conta a receber vencida",
                "contas a receber vencidas"
              ),
            }
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
          const n = count ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.financeCreditAnalysis,
            n,
            "attention",
            {
              detailId: "finance.credit-analysis",
              detailLabel: countLabel(
                n,
                "análise de crédito pendente",
                "análises de crédito pendentes"
              ),
            }
          );
        }
      })()
    );

    tasks.push(
      (async () => {
        const db = asUntypedAdmin(admin);
        const fiscalBoardStatuses = [
          "confirmed",
          "in_production",
          "shipped",
          "delivered",
        ] as const;

        // Pronto para emissão (PCP + fiscal OK) — atenção no Faturamento;
        // a emissão em si é na Expedição.
        const { count: readyCount, error: readyErr } = await db
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("billing_closure", null)
          .eq("ready_for_invoice", true)
          .in("status", [...fiscalBoardStatuses])
          .in("fiscal_status", [
            "rules_applied",
            "manual_override",
            "approved",
          ]);
        if (!readyErr) {
          const n = readyCount ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.fiscalInvoicing,
            n,
            "attention",
            {
              detailId: "fiscal.ready-for-invoice",
              detailLabel: countLabel(
                n,
                "pedido pronto para emissão (Expedição)",
                "pedidos prontos para emissão (Expedição)"
              ),
            }
          );
        }
        // Árvore de Natal: PCP liberou sem fiscal — urgente (subconjunto).
        const { count: xmasCount, error: xmasErr } = await db
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("billing_closure", null)
          .eq("ready_for_invoice", true)
          .in("fiscal_status", ["pending", "no_rules", "review_required"])
          .in("status", [...fiscalBoardStatuses]);
        if (!xmasErr) {
          const n = xmasCount ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.fiscalInvoicing,
            n,
            "urgent",
            {
              detailId: "fiscal.ready-without-review",
              detailLabel: countLabel(
                n,
                "pedido liberado pelo PCP sem conferência fiscal",
                "pedidos liberados pelo PCP sem conferência fiscal"
              ),
            }
          );
        }
        // Fiscal por conferir sem urgência PCP — exclui ready_for_invoice
        // (já contados na árvore de Natal) para não duplicar o badge.
        const { count: pendingFiscalCount, error: pendingErr } = await db
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("billing_closure", null)
          .eq("ready_for_invoice", false)
          .in("status", [...fiscalBoardStatuses])
          .in("fiscal_status", ["pending", "no_rules"]);
        if (!pendingErr) {
          const n = pendingFiscalCount ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.fiscalInvoicing,
            n,
            "attention",
            {
              detailId: "fiscal.pending-review",
              detailLabel: countLabel(
                n,
                "pedido com fiscal por conferir",
                "pedidos com fiscal por conferir"
              ),
            }
          );
        }
        // Revisão do motor — só se PCP ainda não liberou (senão já está no xmas).
        const { count: reviewCount, error: reviewErr } = await db
          .from("sales_orders")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("billing_closure", null)
          .eq("ready_for_invoice", false)
          .eq("fiscal_status", "review_required")
          .in("status", [...fiscalBoardStatuses]);
        if (!reviewErr) {
          const n = reviewCount ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.fiscalInvoicing,
            n,
            "urgent",
            {
              detailId: "fiscal.review-required",
              detailLabel: countLabel(
                n,
                "pedido com fiscal a rever",
                "pedidos com fiscal a rever"
              ),
            }
          );
        }
        // NF-e em erro — urgente.
        const { count: nfeErrCount, error: nfeErr } = await admin
          .from("nfes")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "error");
        if (!nfeErr) {
          const n = nfeErrCount ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.fiscalInvoicing,
            n,
            "urgent",
            {
              detailId: "fiscal.nfe-error",
              detailLabel: countLabel(n, "NF-e em erro", "NF-e em erro"),
            }
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
          const n = count ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.salesQuotes,
            n,
            "attention",
            {
              detailId: "sales.quotes.finalize",
              detailLabel: countLabel(
                n,
                "orçamento aguardando finalização",
                "orçamentos aguardando finalização"
              ),
            }
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
          const n = count ?? 0;
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.pcpPlanning,
            n,
            "attention",
            {
              detailId: "pcp.mrp-pending",
              detailLabel: countLabel(
                n,
                "pedido aguardando planeamento MRP",
                "pedidos aguardando planeamento MRP"
              ),
            }
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
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.dataHealth,
            blockers,
            "urgent",
            {
              detailId: "data-health.blockers",
              detailLabel: countLabel(
                blockers,
                "bloqueio de dados",
                "bloqueios de dados"
              ),
            }
          );
        }
        if (warnings > 0) {
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.dataHealth,
            warnings,
            "attention",
            {
              detailId: "data-health.warnings",
              detailLabel: countLabel(
                warnings,
                "aviso de dados",
                "avisos de dados"
              ),
            }
          );
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
            details,
            MENU_ALERT_PATHS.onboarding,
            pendingBlockers,
            "urgent",
            {
              detailId: "onboarding.blockers",
              detailLabel: countLabel(
                pendingBlockers,
                "passo obrigatório de configuração",
                "passos obrigatórios de configuração"
              ),
            }
          );
        } else if (pendingRecommended > 0) {
          pushAlert(
            alerts,
            details,
            MENU_ALERT_PATHS.onboarding,
            pendingRecommended,
            "info",
            {
              detailId: "onboarding.recommended",
              detailLabel: countLabel(
                pendingRecommended,
                "recomendação de configuração",
                "recomendações de configuração"
              ),
            }
          );
        }
      } catch {
        /* ignora */
      }
    })()
  );

  await Promise.all(tasks);
  return { alerts, details };
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

/** Pendências visíveis na página actual (mesmo destino ou sub-rota do alerta). */
export function getPendingDetailsForPath(
  pathname: string,
  details: MenuAlertDetail[]
): MenuAlertDetail[] {
  return details.filter((d) => {
    const base = d.href.split("?")[0];
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}
