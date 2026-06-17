import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { resolveFiscalRule } from "@/modules/fiscal/lib/fiscal-rules-engine";
import type {
  FiscalContext,
  FiscalRuleRow,
} from "@/modules/fiscal/lib/fiscal-rules-types";
import { listFiscalRules } from "@/modules/fiscal/lib/fiscal-rules-service";

type Admin = SupabaseClient<Database>;

export type FiscalInconsistencySeverity = "blocker" | "warning" | "info";

export type FiscalInconsistency = {
  /** Identificador estável da regra de verificação. */
  check_id: string;
  severity: FiscalInconsistencySeverity;
  title: string;
  impact: string;
  detail?: string;
  count?: number;
  /** IDs de fiscal_rules relacionadas. */
  fiscal_rule_ids?: string[];
  href?: string;
};

function ruleSignature(rule: FiscalRuleRow): string {
  return [
    rule.operation_type ?? "*",
    rule.origin_uf ?? "*",
    rule.destination_uf ?? "*",
    rule.ncm_pattern ?? "*",
    rule.product_prefix_code ?? "*",
    rule.product_nature ?? "*",
    rule.company_tax_regime ?? "*",
  ].join("|");
}

function ruleHasRates(rule: FiscalRuleRow): boolean {
  return (
    rule.icms_rate != null ||
    rule.ipi_rate != null ||
    rule.pis_rate != null ||
    rule.cofins_rate != null
  );
}

function normNcm(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = v.replace(/\D/g, "");
  return n.length >= 4 ? n : null;
}

/**
 * Varre regras fiscais, cadastro e pedidos à procura de lacunas e conflitos.
 * Determinístico — a IA só pode explicar estes resultados, nunca inventar novos.
 */
export async function scanFiscalInconsistencies(
  admin: Admin,
  tenantId: string
): Promise<FiscalInconsistency[]> {
  const issues: FiscalInconsistency[] = [];
  const rules = await listFiscalRules(admin, tenantId);
  const active = rules.filter((r) => r.is_active);

  const { data: company } = await admin
    .from("company_settings")
    .select("address_state, tax_regime")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const originUf = company?.address_state?.trim().toUpperCase() || null;

  if (active.length === 0) {
    issues.push({
      check_id: "no_active_fiscal_rules",
      severity: "warning",
      title: "Nenhuma regra fiscal activa",
      impact:
        "Pedidos de venda ficam com fiscal_status no_rules até a contadora cadastrar regras.",
      href: "/settings/fiscal-rules",
      count: 0,
    });
  }

  const withoutCfop = active.filter((r) => !r.cfop?.trim());
  if (withoutCfop.length > 0) {
    issues.push({
      check_id: "rules_without_cfop",
      severity: "blocker",
      title: "Regras activas sem CFOP",
      impact:
        "O motor fiscal não consegue preencher CFOP na linha do pedido — bloqueia conferência fiscal.",
      count: withoutCfop.length,
      fiscal_rule_ids: withoutCfop.map((r) => r.id),
      href: "/settings/fiscal-rules",
    });
  }

  const withoutRates = active.filter((r) => !ruleHasRates(r));
  if (withoutRates.length > 0) {
    issues.push({
      check_id: "rules_without_rates",
      severity: "warning",
      title: "Regras activas sem alíquotas",
      impact:
        "Regra pode casar mas fiscal_status fica review_required — impostos não calculados automaticamente.",
      count: withoutRates.length,
      fiscal_rule_ids: withoutRates.map((r) => r.id),
      href: "/settings/fiscal-rules",
    });
  }

  const bySignature = new Map<string, FiscalRuleRow[]>();
  for (const rule of active) {
    const sig = ruleSignature(rule);
    const list = bySignature.get(sig) ?? [];
    list.push(rule);
    bySignature.set(sig, list);
  }

  for (const [, group] of bySignature) {
    if (group.length < 2) continue;
    const cfops = new Set(group.map((r) => r.cfop ?? "").filter(Boolean));
    const icms = new Set(
      group.map((r) => String(r.icms_rate ?? "")).filter((v) => v !== "")
    );
    if (cfops.size > 1 || icms.size > 1) {
      issues.push({
        check_id: "conflicting_rule_signatures",
        severity: "blocker",
        title: "Regras sobrepostas com CFOP ou ICMS diferentes",
        impact:
          "Mesmas condições (UF, NCM, prefixo…) apontam para resultados distintos — o motor usa prioridade, mas a contadora deve unificar.",
        count: group.length,
        fiscal_rule_ids: group.map((r) => r.id),
        detail: group.map((r) => `"${r.name}" (prio ${r.priority})`).join(" · "),
        href: "/settings/fiscal-rules",
      });
    }
  }

  const { count: ordersBlocked } = await admin
    .from("sales_orders")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "in_production", "ready_for_invoice"])
    .in("fiscal_status", ["no_rules", "review_required", "pending"]);

  if ((ordersBlocked ?? 0) > 0) {
    issues.push({
      check_id: "sales_orders_fiscal_blocked",
      severity: "warning",
      title: "Pedidos activos com fiscal pendente ou em revisão",
      impact:
        "PVs em produção ou prontos para faturar ainda não têm fiscal resolvido — conferir regras ou endereço do cliente (UF).",
      count: ordersBlocked ?? 0,
      href: "/sales/orders",
    });
  }

  if (originUf && active.length > 0) {
    const { data: products } = await admin
      .from("products")
      .select(
        "id, name, ncm, product_nature, prefix:product_prefixes(code)"
      )
      .eq("tenant_id", tenantId)
      .eq("released_for_sale", true)
      .not("ncm", "is", null)
      .limit(200);

    let unmatched = 0;
    const sampleNames: string[] = [];

    for (const p of products ?? []) {
      const ncm = normNcm(p.ncm);
      if (!ncm) continue;
      const prefixRaw = p.prefix as
        | { code?: string }
        | { code?: string }[]
        | null;
      const prefix = Array.isArray(prefixRaw) ? prefixRaw[0] : prefixRaw;

      const ctx: FiscalContext = {
        operationType: "sale",
        originUf,
        destinationUf: originUf,
        taxRegimeId: null,
        companyTaxRegime: company?.tax_regime ?? null,
        ncm,
        productPrefixCode: prefix?.code ?? null,
        productNature: p.product_nature ?? null,
      };

      const match = resolveFiscalRule(active, ctx);
      if (match.fiscalStatus === "no_rules") {
        unmatched += 1;
        if (sampleNames.length < 5) {
          sampleNames.push(String(p.name ?? p.id).slice(0, 60));
        }
      }
    }

    if (unmatched > 0) {
      issues.push({
        check_id: "products_no_matching_rule",
        severity: "blocker",
        title: "Produtos liberados sem regra fiscal que case",
        impact:
          "NCM/prefixo do produto não encontra regra activa (venda intra-estado de teste) — faturamento degradará para no_rules.",
        count: unmatched,
        detail:
          sampleNames.length > 0
            ? `Ex.: ${sampleNames.join("; ")}`
            : undefined,
        href: "/products?missing=ncm",
      });
    }
  } else if (!originUf) {
    issues.push({
      check_id: "company_without_origin_uf",
      severity: "blocker",
      title: "Empresa sem UF de origem",
      impact:
        "Sem UF de origem em Configurações, o motor fiscal não resolve operações interestaduais.",
      count: 1,
      href: "/settings/company",
    });
  }

  const severityOrder: Record<FiscalInconsistencySeverity, number> = {
    blocker: 0,
    warning: 1,
    info: 2,
  };

  issues.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return issues;
}
