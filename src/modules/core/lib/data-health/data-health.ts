import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

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

  // PCP -----------------------------------------------------------------
  // Pedidos efetivados sem prazo PCP definido → linha do tempo cega.
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
