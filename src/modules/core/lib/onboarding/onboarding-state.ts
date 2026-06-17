import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

/**
 * §16 do documento funcional: assistente de onboarding de tenant.
 *
 * Devolve uma "checklist" do que está pronto vs faltando para um tenant
 * recém-criado. Cada item tem severidade (blocker = não consegue operar
 * sem isto) e link directo para a página que resolve.
 *
 * Não preenche dado por dotação automática — o ERP não inventa CNPJ,
 * regime ou alíquota. O wizard só guia.
 */

export type OnboardingItem = {
  id: string;
  title: string;
  description: string;
  severity: "blocker" | "recommended";
  done: boolean;
  href: string;
};

type Admin = SupabaseClient<Database>;

export async function loadOnboardingState(
  admin: Admin,
  tenantId: string
): Promise<{ items: OnboardingItem[]; progressPct: number }> {
  const items: OnboardingItem[] = [];

  // 1. Dados da empresa
  let hasCompanyCore = false;
  let hasCompanyTaxRegime = false;
  let hasCompanyState = false;
  try {
    const { data: c } = await admin
      .from("company_settings")
      .select("cnpj, tax_regime, address_state, company_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    hasCompanyCore = Boolean(
      c?.cnpj &&
        c.cnpj.trim().length > 0 &&
        c.company_name &&
        c.company_name.trim().length > 0
    );
    hasCompanyTaxRegime = Boolean(
      c?.tax_regime && c.tax_regime.trim().length > 0
    );
    hasCompanyState = Boolean(
      c?.address_state && c.address_state.trim().length > 0
    );
  } catch {
    /* empresa pode não existir ainda */
  }

  items.push({
    id: "company_basic",
    title: "Cadastrar dados da empresa (CNPJ, razão social)",
    description:
      "Toda emissão fiscal e documento PDF depende dos dados da empresa. Necessário antes de qualquer operação real.",
    severity: "blocker",
    done: hasCompanyCore,
    href: "/settings/company",
  });

  items.push({
    id: "company_tax_regime",
    title: "Definir regime tributário",
    description:
      "Simples, Lucro Presumido ou Real. Sem isto o motor fiscal não filtra regras específicas do regime.",
    severity: "blocker",
    done: hasCompanyTaxRegime,
    href: "/settings/company",
  });

  items.push({
    id: "company_state",
    title: "Definir UF de origem da empresa",
    description:
      "Necessária para resolver operações interestaduais no motor fiscal.",
    severity: "blocker",
    done: hasCompanyState,
    href: "/settings/company",
  });

  // 2. Áreas de trabalho (centros de custo)
  let workAreasCount = 0;
  try {
    const { count } = await admin
      .from("work_areas")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    workAreasCount = count ?? 0;
  } catch {
    /* tabela pode não existir em ambiente antigo */
  }
  items.push({
    id: "work_areas",
    title: "Cadastrar pelo menos uma área de trabalho",
    description:
      "Centros de custo organizam apontamento de produção, custo e relatórios.",
    severity: "recommended",
    done: workAreasCount > 0,
    href: "/settings/work-areas",
  });

  // 3. Centros de trabalho
  let workCentersCount = 0;
  try {
    const { count } = await admin
      .from("work_centers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    workCentersCount = count ?? 0;
  } catch {
    /* ignora */
  }
  items.push({
    id: "work_centers",
    title: "Cadastrar centros de trabalho",
    description:
      "Necessário para sequência de operações e apontamento por máquina.",
    severity: "recommended",
    done: workCentersCount > 0,
    href: "/settings/work-centers",
  });

  // 4. BDI default
  let bdiCount = 0;
  try {
    const { count } = await admin
      .from("bdi_settings")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    bdiCount = count ?? 0;
  } catch {
    /* ignora se a tabela não existir */
  }
  items.push({
    id: "bdi",
    title: "Configurar BDI de precificação",
    description:
      "BDI default usado nos orçamentos para margem alvo. Pode ser ajustado por linha depois.",
    severity: "recommended",
    done: bdiCount > 0,
    href: "/settings/bdi",
  });

  // 5. Pelo menos um administrador além de quem está fazendo o onboarding
  // (sempre verdadeiro por construção — quem chega aqui é admin do tenant).

  // 6. Pelo menos uma regra fiscal cadastrada? — recomendável
  let fiscalRulesCount = 0;
  try {
    const db = asUntypedAdmin(admin);
    const { count } = await db
      .from("fiscal_rules")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    fiscalRulesCount = count ?? 0;
  } catch {
    /* ignora */
  }
  items.push({
    id: "fiscal_rules",
    title: "Cadastrar regras fiscais (com a contadora)",
    description:
      "Alíquotas e CFOP só são aplicados quando há regra cadastrada. Sem regras, o sistema mantém o comportamento manual.",
    severity: "recommended",
    done: fiscalRulesCount > 0,
    href: "/settings/fiscal-rules",
  });

  // 7. Cliente de teste cadastrado (sinal de que o sistema começou a operar)
  let customersCount = 0;
  try {
    const { count } = await admin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    customersCount = count ?? 0;
  } catch {
    /* ignora */
  }
  items.push({
    id: "first_customer",
    title: "Cadastrar primeiro cliente",
    description: "Sem cliente, não há orçamento nem pedido a emitir.",
    severity: "recommended",
    done: customersCount > 0,
    href: "/customers",
  });

  // Vertical HVAC — ficha técnica no primeiro acabado
  let hvacSpecsCount = 0;
  try {
    const { count } = await admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("product_nature", "AC")
      .not("hvac_filter_class", "is", null);
    hvacSpecsCount = count ?? 0;
  } catch {
    /* migration HVAC pode ainda não existir */
  }
  items.push({
    id: "hvac_first_specs",
    title: "Preencher ficha técnica HVAC num produto acabado",
    description:
      "Vertical de domínio — classe HEPA, vazão e teste de integridade na aba HVAC do produto.",
    severity: "recommended",
    done: hvacSpecsCount > 0,
    href: "/products",
  });

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 100;

  return { items, progressPct };
}
