import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  applyFiscalToSalesOrderItems,
  listFiscalRules,
} from "@/modules/fiscal/lib/fiscal-rules-service";
import {
  scanFiscalInconsistencies,
  type FiscalInconsistency,
} from "@/modules/fiscal/lib/fiscal-inconsistency-scan";

type Admin = SupabaseClient<Database>;

export type FiscalRemediationAction = {
  step: string;
  status: "done" | "skipped" | "blocked";
  detail: string;
};

export type FiscalRemediationResult = {
  summary: string;
  actions: FiscalRemediationAction[];
  rules_created: number;
  rules_activated: number;
  orders_reapplied: number;
  issues_before: number;
  issues_after: number;
  remaining: FiscalInconsistency[];
};

type CompanyFiscalContext = {
  originUf: string | null;
  taxRegime: string | null;
};

type RuleSeed = {
  name: string;
  description: string;
  priority: number;
  operation_type: "sale";
  origin_uf: string | null;
  destination_uf: string | null;
  company_tax_regime: string | null;
  product_nature: string | null;
  cfop: string;
  icms_rate: number | null;
  ipi_rate: number | null;
  pis_rate: number | null;
  cofins_rate: number | null;
  notes: string;
};

async function loadCompanyContext(
  admin: Admin,
  tenantId: string
): Promise<CompanyFiscalContext> {
  const { data } = await admin
    .from("company_settings")
    .select("address_state, tax_regime")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    originUf: data?.address_state?.trim().toUpperCase() || null,
    taxRegime: data?.tax_regime ?? null,
  };
}

function isSimples(regime: string | null): boolean {
  const r = (regime ?? "").toLowerCase();
  return r.includes("simples");
}

/** Pacote mínimo de regras para o motor deixar de ficar em no_rules. */
function buildDefaultRuleSeeds(ctx: CompanyFiscalContext): RuleSeed[] {
  const origin = ctx.originUf;
  const regime = ctx.taxRegime;
  const sn = isSimples(regime);
  // Simples Nacional (DAS): alíquotas de saída tipicamente 0 no ERP; revisão pela contadora.
  const rates = sn
    ? { icms_rate: 0, ipi_rate: 0, pis_rate: 0, cofins_rate: 0 }
    : { icms_rate: null, ipi_rate: null, pis_rate: null, cofins_rate: null };

  const regimeLabel = sn
    ? "Simples Nacional"
    : regime === "lucro_presumido"
      ? "Lucro Presumido"
      : regime === "lucro_real"
        ? "Lucro Real"
        : "regime da empresa";

  const noteBase = sn
    ? `Pacote automático (${regimeLabel}). ICMS/PIS/COFINS zerados na saída (DAS). Contadora pode ajustar.`
    : `Pacote automático (${regimeLabel}). CFOP definido; alíquotas vazias para a contadora preencher.`;

  const seeds: RuleSeed[] = [
    {
      name: `Venda interno — revenda (${origin ?? "UF"})`,
      description: `Venda dentro do estado — destino revenda`,
      priority: 10,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: origin,
      company_tax_regime: regime,
      product_nature: "revenda",
      cfop: "5102",
      ...rates,
      notes: noteBase,
    },
    {
      name: `Venda interno — consumidor (${origin ?? "UF"})`,
      description: `Venda dentro do estado — consumidor final`,
      priority: 20,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: origin,
      company_tax_regime: regime,
      product_nature: "consumidor",
      cfop: "5101",
      ...rates,
      notes: noteBase,
    },
    {
      name: `Venda interestadual — revenda (${origin ?? "UF"})`,
      description: `Venda para outro estado — revenda`,
      priority: 30,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: null,
      company_tax_regime: regime,
      product_nature: "revenda",
      cfop: "6102",
      ...rates,
      notes: noteBase,
    },
    {
      name: `Venda interestadual — consumidor (${origin ?? "UF"})`,
      description: `Venda para outro estado — consumidor final`,
      priority: 40,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: null,
      company_tax_regime: regime,
      product_nature: "consumidor",
      cfop: "6101",
      ...rates,
      notes: noteBase,
    },
    {
      name: `Venda interno — industrialização (${origin ?? "UF"})`,
      description: `Venda para industrialização dentro do estado`,
      priority: 50,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: origin,
      company_tax_regime: regime,
      product_nature: "industrializacao",
      cfop: "5124",
      ...rates,
      notes: noteBase,
    },
    // Coringa: cobre produtos sem natureza preenchida
    {
      name: `Venda interno — padrão (${origin ?? "UF"})`,
      description: `Coringa intra-estado quando natureza do produto não está definida`,
      priority: 90,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: origin,
      company_tax_regime: regime,
      product_nature: null,
      cfop: "5102",
      ...rates,
      notes: `${noteBase} Regra coringa — prioridade baixa.`,
    },
    {
      name: `Venda interestadual — padrão (${origin ?? "UF"})`,
      description: `Coringa interestadual quando natureza do produto não está definida`,
      priority: 95,
      operation_type: "sale",
      origin_uf: origin,
      destination_uf: null,
      company_tax_regime: regime,
      product_nature: null,
      cfop: "6102",
      ...rates,
      notes: `${noteBase} Regra coringa interestadual — prioridade baixa.`,
    },
  ];

  return seeds;
}

async function activateInactiveRules(
  admin: Admin,
  tenantId: string
): Promise<{ count: number; names: string[] }> {
  const db = asUntypedAdmin(admin);
  const all = await listFiscalRules(admin, tenantId);
  const inactive = all.filter((r) => !r.is_active);
  if (!inactive.length) return { count: 0, names: [] };

  const ids = inactive.map((r) => r.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("fiscal_rules") as any)
    .update({ is_active: true })
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return { count: inactive.length, names: inactive.map((r) => r.name) };
}

async function fillMissingCfops(
  admin: Admin,
  tenantId: string,
  originUf: string | null
): Promise<number> {
  const all = await listFiscalRules(admin, tenantId);
  const needCfop = all.filter((r) => r.is_active && !r.cfop?.trim());
  if (!needCfop.length) return 0;

  const db = asUntypedAdmin(admin);
  let updated = 0;
  for (const rule of needCfop) {
    const intra =
      rule.origin_uf &&
      rule.destination_uf &&
      rule.origin_uf === rule.destination_uf;
    const sameOrigin = !rule.destination_uf && rule.origin_uf === originUf;
    let cfop = "5102";
    if (rule.product_nature === "consumidor") {
      cfop = intra || sameOrigin || !rule.destination_uf ? "5101" : "6101";
    } else if (rule.product_nature === "industrializacao") {
      cfop = intra || sameOrigin || !rule.destination_uf ? "5124" : "6124";
    } else {
      cfop = intra || sameOrigin || !rule.destination_uf ? "5102" : "6102";
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("fiscal_rules") as any)
      .update({ cfop })
      .eq("id", rule.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    updated += 1;
  }
  return updated;
}

async function createMissingDefaultRules(
  admin: Admin,
  tenantId: string,
  userId: string | null,
  ctx: CompanyFiscalContext
): Promise<{ created: number; names: string[] }> {
  const existing = await listFiscalRules(admin, tenantId);
  const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));
  const seeds = buildDefaultRuleSeeds(ctx);
  const db = asUntypedAdmin(admin);
  const createdNames: string[] = [];

  for (const seed of seeds) {
    if (existingNames.has(seed.name.toLowerCase())) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("fiscal_rules") as any).insert({
      tenant_id: tenantId,
      name: seed.name,
      description: seed.description,
      priority: seed.priority,
      is_active: true,
      operation_type: seed.operation_type,
      origin_uf: seed.origin_uf,
      destination_uf: seed.destination_uf,
      company_tax_regime: seed.company_tax_regime,
      product_nature: seed.product_nature,
      cfop: seed.cfop,
      icms_rate: seed.icms_rate,
      ipi_rate: seed.ipi_rate,
      pis_rate: seed.pis_rate,
      cofins_rate: seed.cofins_rate,
      notes: seed.notes,
      created_by: userId,
    });
    if (error) {
      // Nome duplicado ou conflito — segue
      if (error.message.toLowerCase().includes("unique")) continue;
      throw new Error(error.message);
    }
    createdNames.push(seed.name);
    existingNames.add(seed.name.toLowerCase());
  }

  return { created: createdNames.length, names: createdNames };
}

async function reapplyBlockedSalesOrders(
  admin: Admin,
  tenantId: string,
  userId: string | null,
  limit = 40
): Promise<{ processed: number; errors: string[] }> {
  const { data: orders, error } = await admin
    .from("sales_orders")
    .select("id, order_number")
    .eq("tenant_id", tenantId)
    .in("status", [
      "confirmed",
      "in_production",
      "shipped",
      "delivered",
      "ready_for_invoice",
    ])
    .in("fiscal_status", ["no_rules", "review_required", "pending"])
    .order("order_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  let processed = 0;
  const errors: string[] = [];
  for (const order of orders ?? []) {
    try {
      await applyFiscalToSalesOrderItems(
        admin,
        tenantId,
        order.id,
        userId
      );
      processed += 1;
    } catch (e) {
      errors.push(
        `${order.order_number}: ${e instanceof Error ? e.message : "erro"}`
      );
    }
  }
  return { processed, errors };
}

/**
 * Agente fiscal: executa remediação determinística das inconsistências
 * (cria regras base, activa inactivas, preenche CFOP, reaplica pedidos).
 */
export async function remediateFiscalInconsistencies(
  admin: Admin,
  tenantId: string,
  userId?: string | null
): Promise<FiscalRemediationResult> {
  const actions: FiscalRemediationAction[] = [];
  const before = await scanFiscalInconsistencies(admin, tenantId);
  const ctx = await loadCompanyContext(admin, tenantId);

  if (!ctx.originUf) {
    actions.push({
      step: "UF de origem",
      status: "blocked",
      detail:
        "Empresa sem UF em Configurações da empresa. Preencha o endereço (estado) e volte a executar o assistente.",
    });
    return {
      summary:
        "Não foi possível avançar: falta UF de origem da empresa. Configure em Settings → Empresa e execute de novo.",
      actions,
      rules_created: 0,
      rules_activated: 0,
      orders_reapplied: 0,
      issues_before: before.length,
      issues_after: before.length,
      remaining: before,
    };
  }

  if (!ctx.taxRegime) {
    actions.push({
      step: "Regime tributário",
      status: "skipped",
      detail:
        "Regime não preenchido — regras serão criadas sem filtro de regime (coringa). Recomenda-se definir Simples/Lucro em Configurações.",
    });
  } else {
    actions.push({
      step: "Contexto empresa",
      status: "done",
      detail: `UF ${ctx.originUf}, regime ${ctx.taxRegime}.`,
    });
  }

  // 1) Activar inactivas só se não houver nenhuma activa (evita reactivar regras desligadas de propósito)
  const existingRules = await listFiscalRules(admin, tenantId);
  let activeCount = existingRules.filter((r) => r.is_active).length;
  let activated = { count: 0, names: [] as string[] };
  if (activeCount === 0) {
    activated = await activateInactiveRules(admin, tenantId);
    if (activated.count > 0) {
      actions.push({
        step: "Activar regras inactivas",
        status: "done",
        detail: `${activated.count} regra(s): ${activated.names.slice(0, 5).join(", ")}.`,
      });
      activeCount = activated.count;
    } else {
      actions.push({
        step: "Activar regras inactivas",
        status: "skipped",
        detail: "Sem regras activas nem inactivas para reactivar.",
      });
    }
  } else {
    actions.push({
      step: "Activar regras inactivas",
      status: "skipped",
      detail: `Já há ${activeCount} activa(s) — não reactiva regras desligadas.`,
    });
  }

  // 2) Criar pacote base se ainda não houver activas / produtos órfãos
  let created = { created: 0, names: [] as string[] };
  if (
    activeCount === 0 ||
    before.some(
      (i) =>
        i.check_id === "no_active_fiscal_rules" ||
        i.check_id === "products_no_matching_rule"
    )
  ) {
    created = await createMissingDefaultRules(
      admin,
      tenantId,
      userId ?? null,
      ctx
    );
    if (created.created > 0) {
      actions.push({
        step: "Criar regras fiscais base",
        status: "done",
        detail: `${created.created} regra(s) criadas: ${created.names.join("; ")}.`,
      });
    } else {
      actions.push({
        step: "Criar regras fiscais base",
        status: "skipped",
        detail: "Pacote base já existia ou nomes já cadastrados.",
      });
    }
  } else {
    actions.push({
      step: "Criar regras fiscais base",
      status: "skipped",
      detail: `Já existem ${activeCount} regra(s) activa(s).`,
    });
  }

  // 3) Preencher CFOP em regras activas sem CFOP
  const cfopFilled = await fillMissingCfops(admin, tenantId, ctx.originUf);
  actions.push({
    step: "Preencher CFOP em falta",
    status: cfopFilled > 0 ? "done" : "skipped",
    detail:
      cfopFilled > 0
        ? `${cfopFilled} regra(s) actualizadas com CFOP heurístico.`
        : "Todas as regras activas já tinham CFOP.",
  });

  // 4) Reaplicar motor nos pedidos bloqueados
  const reapplied = await reapplyBlockedSalesOrders(
    admin,
    tenantId,
    userId ?? null
  );
  actions.push({
    step: "Reaplicar fiscal nos pedidos",
    status: reapplied.processed > 0 ? "done" : "skipped",
    detail:
      reapplied.processed > 0
        ? `${reapplied.processed} pedido(s) reprocessados.${
            reapplied.errors.length
              ? ` Falhas: ${reapplied.errors.slice(0, 3).join(" · ")}`
              : ""
          }`
        : "Nenhum pedido activo com fiscal pendente.",
  });

  const after = await scanFiscalInconsistencies(admin, tenantId);
  const remainingBlockers = after.filter((i) => i.severity === "blocker");

  const summaryParts = [
    `Antes: ${before.length} inconsistência(s). Depois: ${after.length}.`,
    created.created > 0 ? `Criadas ${created.created} regras.` : null,
    activated.count > 0 ? `Activadas ${activated.count}.` : null,
    reapplied.processed > 0
      ? `Reaplicado em ${reapplied.processed} pedido(s).`
      : null,
    remainingBlockers.length > 0
      ? `Ainda há ${remainingBlockers.length} bloqueio(s) — ver lista abaixo (ex.: alíquotas a preencher pela contadora).`
      : "Sem bloqueios críticos restantes.",
  ];

  return {
    summary: summaryParts.filter(Boolean).join(" "),
    actions,
    rules_created: created.created,
    rules_activated: activated.count,
    orders_reapplied: reapplied.processed,
    issues_before: before.length,
    issues_after: after.length,
    remaining: after,
  };
}
