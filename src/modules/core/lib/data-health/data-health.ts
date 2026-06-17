import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { loadIntegrityTestSummaries } from "@/modules/hvac/lib/hvac-integrity-test-service";
import { loadCleanroomCompatibilitySummaries } from "@/modules/hvac/lib/hvac-cleanroom-service";

/**
 * §13 do documento funcional: Saúde do dado.
 *
 * Regras determinísticas que varrem o cadastro à procura de lacunas
 * críticas — dados incompletos que vão quebrar fiscal, MRP, financeiro
 * ou faturamento. A correção é humana; o sistema aponta e leva ao campo,
 * nunca preenche dado crítico sozinho.
 */

export type DataHealthSeverity = "blocker" | "warning" | "info";

export type DataHealthIssue = {
  /** Identificador estável da regra (para badges, telemetria, dedup). */
  rule_id: string;
  /** Módulo dono do problema (Engenharia, Compras, Faturamento, Vendas, etc). */
  module: string;
  /** Severidade derivada da regra. */
  severity: DataHealthSeverity;
  /** Título curto. */
  title: string;
  /** Descrição do impacto operacional ("vai falhar quando…"). */
  impact: string;
  /** Quantidade de registos afetados. */
  count: number;
  /** Caminho da página que resolve o problema. */
  href: string;
};

type Admin = SupabaseClient<Database>;

async function countOrZero(
  promise: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await promise;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Varre regras de saúde no banco do tenant. Cada regra é uma query
 * `count: exact, head: true` — barata e segura.
 */
export async function loadDataHealthIssues(
  admin: Admin,
  tenantId: string
): Promise<DataHealthIssue[]> {
  const issues: DataHealthIssue[] = [];

  // ENGENHARIA / FATURAMENTO ---------------------------------------------
  // Produtos liberados para venda sem NCM → quebram a aplicação fiscal.
  const productsNoNcm = await countOrZero(
    admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("released_for_sale", true)
      .or("ncm.is.null,ncm.eq.")
  );
  if (productsNoNcm > 0) {
    issues.push({
      rule_id: "products_released_without_ncm",
      module: "Engenharia · Faturamento",
      severity: "blocker",
      title: "Produtos liberados sem NCM",
      impact:
        "O motor fiscal não consegue casar regra por NCM — esses produtos não podem ser faturados.",
      count: productsNoNcm,
      href: "/products?missing=ncm",
    });
  }

  // ENGENHARIA -----------------------------------------------------------
  // Produtos HD (fabricados) liberados sem custo calculado → margem mente.
  const productsZeroCost = await countOrZero(
    admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("released_for_sale", true)
      .eq("type", "HD")
      .or("cost_price.is.null,cost_price.eq.0")
  );
  if (productsZeroCost > 0) {
    issues.push({
      rule_id: "products_released_without_cost",
      module: "Engenharia",
      severity: "warning",
      title: "Produtos HD liberados com custo zero",
      impact:
        "Margem nos orçamentos fica falsa. Confirmar BOM e propagar custo.",
      count: productsZeroCost,
      href: "/products?missing=cost",
    });
  }

  // VENDAS / FATURAMENTO -------------------------------------------------
  // Cliente sem documento (CNPJ/CPF) → impede emissão de NF.
  const customersNoDoc = await countOrZero(
    admin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or("document.is.null,document.eq.")
  );
  if (customersNoDoc > 0) {
    issues.push({
      rule_id: "customers_without_document",
      module: "Vendas · Faturamento",
      severity: "blocker",
      title: "Clientes ativos sem CNPJ/CPF",
      impact: "Não é possível emitir NF-e/NFS-e para o cliente sem documento.",
      count: customersNoDoc,
      href: "/customers",
    });
  }

  // Cliente sem endereço (UF) → motor fiscal não calcula corretamente.
  const customersNoAddress = await countOrZero(
    admin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or("address.is.null,address.eq.")
  );
  if (customersNoAddress > 0) {
    issues.push({
      rule_id: "customers_without_address",
      module: "Vendas · Faturamento",
      severity: "warning",
      title: "Clientes sem endereço cadastrado",
      impact:
        "Sem UF de destino, o motor fiscal degrada para regra coringa — alíquota pode sair errada.",
      count: customersNoAddress,
      href: "/customers",
    });
  }

  // COMPRAS --------------------------------------------------------------
  // Fornecedor ativo sem CNPJ → impede registar NF de compra.
  const suppliersNoDoc = await countOrZero(
    admin
      .from("suppliers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or("document.is.null,document.eq.")
  );
  if (suppliersNoDoc > 0) {
    issues.push({
      rule_id: "suppliers_without_document",
      module: "Compras",
      severity: "blocker",
      title: "Fornecedores ativos sem CNPJ",
      impact: "Não é possível conciliar NF de compra sem CNPJ do emitente.",
      count: suppliersNoDoc,
      href: "/purchasing/suppliers",
    });
  }

  // FATURAMENTO ----------------------------------------------------------
  // Empresa sem CNPJ ou regime configurado.
  try {
    const { data: company } = await admin
      .from("company_settings")
      .select("cnpj, tax_regime, address_state")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!company?.cnpj || String(company.cnpj).trim().length === 0) {
      issues.push({
        rule_id: "company_without_cnpj",
        module: "Faturamento",
        severity: "blocker",
        title: "Empresa sem CNPJ",
        impact:
          "Toda a emissão fiscal exige CNPJ da emitente. Cadastre antes de emitir nota.",
        count: 1,
        href: "/settings/company",
      });
    }
    if (!company?.tax_regime || String(company.tax_regime).trim().length === 0) {
      issues.push({
        rule_id: "company_without_tax_regime",
        module: "Faturamento",
        severity: "warning",
        title: "Regime tributário não definido",
        impact:
          "Sem o regime, o motor fiscal não filtra regras específicas (Simples vs Real vs Presumido).",
        count: 1,
        href: "/settings/company",
      });
    }
    if (
      !company?.address_state ||
      String(company.address_state).trim().length === 0
    ) {
      issues.push({
        rule_id: "company_without_state",
        module: "Faturamento",
        severity: "blocker",
        title: "Empresa sem UF de origem",
        impact:
          "O motor fiscal precisa da UF de origem para resolver operações interestaduais.",
        count: 1,
        href: "/settings/company",
      });
    }
  } catch {
    /* ignora — empresa pode ainda não estar cadastrada (onboarding) */
  }

  // ENGENHARIA / VERTICAL HVAC -------------------------------------------
  const hvacReleasedNoClass = await countOrZero(
    admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("released_for_sale", true)
      .eq("product_nature", "AC")
      .is("hvac_filter_class", null)
  );
  if (hvacReleasedNoClass > 0) {
    issues.push({
      rule_id: "hvac_released_without_filter_class",
      module: "Engenharia · HVAC",
      severity: "warning",
      title: "Produtos acabados liberados sem classe de filtro HVAC",
      impact:
        "Ficha técnica vertical incompleta — engenharia e CQ não têm referência HEPA/vazão.",
      count: hvacReleasedNoClass,
      href: "/products",
    });
  }

  try {
    const { data: finishedItems } = await admin
      .from("order_items")
      .select(
        `
        id,
        product:products!inner (
          hvac_requires_integrity_test
        )
      `
      )
      .eq("tenant_id", tenantId)
      .not("production_completed_at", "is", null);

    const requiringIds = (finishedItems ?? [])
      .filter((row) => {
        const productRaw = row.product as
          | { hvac_requires_integrity_test?: boolean }
          | { hvac_requires_integrity_test?: boolean }[]
          | null;
        const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
        return product?.hvac_requires_integrity_test === true;
      })
      .map((row) => String(row.id));

    if (requiringIds.length > 0) {
      const summaries = await loadIntegrityTestSummaries(
        admin,
        tenantId,
        requiringIds
      );
      let pendingIntegrity = 0;
      for (const id of requiringIds) {
        const summary = summaries.get(id);
        if (summary && !summary.passed) pendingIntegrity++;
      }
      if (pendingIntegrity > 0) {
        issues.push({
          rule_id: "hvac_integrity_test_pending",
          module: "Qualidade · HVAC",
          severity: "warning",
          title: "Produção finalizada sem teste de integridade aprovado",
          impact:
            "A expedição do pedido fica bloqueada até registar PAO/DOP aprovado no CQ.",
          count: pendingIntegrity,
          href: "/production/quality-control",
        });
      }
    }
  } catch {
    /* ignora — tabela ou colunas podem ainda não existir */
  }

  try {
    const { data: hvacReleased } = await admin
      .from("products")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("released_for_sale", true)
      .eq("product_nature", "AC");

    const productIds = (hvacReleased ?? []).map((p) => String(p.id));
    if (productIds.length > 0) {
      const { data: popDocs } = await admin
        .from("product_documents")
        .select("product_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "pop")
        .eq("is_active", true)
        .in("product_id", productIds);

      const withPop = new Set(
        (popDocs ?? []).map((row) => String(row.product_id))
      );
      const missingPop = productIds.filter((id) => !withPop.has(id)).length;
      if (missingPop > 0) {
        issues.push({
          rule_id: "hvac_released_without_pop_document",
          module: "Engenharia · HVAC",
          severity: "warning",
          title: "Produtos acabados liberados sem POP anexado",
          impact:
            "Operação e CQ não têm procedimento formal — anexe POP na aba Documentos.",
          count: missingPop,
          href: "/products",
        });
      }

      const { data: checklistRows } = await admin
        .from("product_hvac_checklist_items")
        .select("product_id")
        .eq("tenant_id", tenantId)
        .in("product_id", productIds);

      const withChecklist = new Set(
        (checklistRows ?? []).map((row) => String(row.product_id))
      );
      const missingChecklist = productIds.filter(
        (id) => !withChecklist.has(id)
      ).length;
      if (missingChecklist > 0) {
        issues.push({
          rule_id: "hvac_released_without_pop_checklist",
          module: "Engenharia · HVAC",
          severity: "warning",
          title: "Produtos acabados sem checklist POP HEPA",
          impact:
            "CQ não consegue marcar verificação na linha — aplique template na aba HVAC.",
          count: missingChecklist,
          href: "/products",
        });
      }
    }
  } catch {
    /* ignora — migrations V3 podem ainda não existir */
  }

  try {
    const { count: acReleasedCount } = await admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("product_nature", "AC")
      .eq("released_for_sale", true);

    if ((acReleasedCount ?? 0) > 0) {
      const linesNoIso = await countOrZero(
        admin
          .from("production_lines")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .is("hvac_cleanroom_class", null)
      );
      if (linesNoIso > 0) {
        issues.push({
          rule_id: "hvac_production_line_missing_iso",
          module: "Produção · HVAC",
          severity: "warning",
          title: "Linhas de produção sem classe ISO cadastrada",
          impact:
            "Produtos HEPA podem ser programados em área não classificada — cadastre ISO na linha.",
          count: linesNoIso,
          href: "/production/lines",
        });
      }
    }

    const { data: openOrderItems } = await admin
      .from("order_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_suggestion", false)
      .is("completed_at", null);

    const openIds = (openOrderItems ?? []).map((row) => String(row.id));
    if (openIds.length > 0) {
      const summaries = await loadCleanroomCompatibilitySummaries(
        admin,
        tenantId,
        openIds
      );
      let incompatible = 0;
      for (const id of openIds) {
        const summary = summaries.get(id);
        if (summary?.applicable && !summary.compatible) incompatible++;
      }
      if (incompatible > 0) {
        issues.push({
          rule_id: "hvac_cleanroom_incompatible_ops",
          module: "PCP · HVAC",
          severity: "warning",
          title: "OPs em linha incompatível com classe ISO do produto",
          impact:
            "Finalização e expedição ficam bloqueadas até ajustar linha ou ficha HVAC.",
          count: incompatible,
          href: "/logistics/pcp",
        });
      }
    }
  } catch {
    /* ignora — migration V5 pode ainda não existir */
  }

  const ordersNoDeadline = await countOrZero(
    admin
      .from("sales_orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "in_production"])
      .is("expected_delivery_date", null)
  );
  if (ordersNoDeadline > 0) {
    issues.push({
      rule_id: "sales_orders_without_expected_delivery",
      module: "PCP",
      severity: "warning",
      title: "Pedidos sem prazo de entrega",
      impact:
        "Sem prazo, o cronograma não consegue ranquear urgência de produção.",
      count: ordersNoDeadline,
      href: "/logistics/pcp",
    });
  }

  return issues;
}
