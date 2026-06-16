import type {
  FiscalContext,
  FiscalRuleMatchResult,
  FiscalRuleRow,
  FiscalRates,
  FiscalStatus,
} from "@/modules/fiscal/lib/fiscal-rules-types";

function normUf(v: string | null | undefined): string | null {
  if (!v) return null;
  const u = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(u) ? u : null;
}

function normNcm(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = v.replace(/\D/g, "");
  return n.length >= 4 ? n : null;
}

function ncmMatches(pattern: string, ncm: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p.endsWith("%")) {
    const prefix = p.slice(0, -1).replace(/\D/g, "");
    return prefix.length > 0 && ncm.startsWith(prefix);
  }
  return ncm === p.replace(/\D/g, "");
}

function isRuleInDateRange(
  rule: FiscalRuleRow,
  at: Date = new Date()
): boolean {
  const day = at.toISOString().slice(0, 10);
  if (rule.valid_from && day < rule.valid_from) return false;
  if (rule.valid_until && day > rule.valid_until) return false;
  return true;
}

type RuleScore = {
  score: number;
  matched: Record<string, string>;
};

function scoreRule(rule: FiscalRuleRow, ctx: FiscalContext): RuleScore | null {
  let score = 0;
  const matched: Record<string, string> = {};

  if (rule.operation_type != null) {
    if (rule.operation_type !== ctx.operationType) return null;
    score += 1;
    matched.operation_type = rule.operation_type;
  }

  const origin = normUf(rule.origin_uf);
  const ctxOrigin = normUf(ctx.originUf);
  if (origin != null) {
    if (!ctxOrigin || origin !== ctxOrigin) return null;
    score += 1;
    matched.origin_uf = origin;
  }

  const dest = normUf(rule.destination_uf);
  const ctxDest = normUf(ctx.destinationUf);
  if (dest != null) {
    if (!ctxDest || dest !== ctxDest) return null;
    score += 1;
    matched.destination_uf = dest;
  }

  if (rule.tax_regime_id != null) {
    if (!ctx.taxRegimeId || rule.tax_regime_id !== ctx.taxRegimeId) return null;
    score += 1;
    matched.tax_regime_id = rule.tax_regime_id;
  }

  if (rule.company_tax_regime != null) {
    if (
      !ctx.companyTaxRegime ||
      rule.company_tax_regime !== ctx.companyTaxRegime
    ) {
      return null;
    }
    score += 1;
    matched.company_tax_regime = rule.company_tax_regime;
  }

  const ctxNcm = normNcm(ctx.ncm);
  if (rule.ncm_pattern != null && rule.ncm_pattern.trim() !== "") {
    if (!ctxNcm || !ncmMatches(rule.ncm_pattern, ctxNcm)) return null;
    score += 1;
    matched.ncm_pattern = rule.ncm_pattern;
  }

  if (rule.product_prefix_code != null && rule.product_prefix_code.trim() !== "") {
    if (
      !ctx.productPrefixCode ||
      rule.product_prefix_code.trim() !== ctx.productPrefixCode.trim()
    ) {
      return null;
    }
    score += 1;
    matched.product_prefix_code = rule.product_prefix_code;
  }

  if (rule.product_nature != null && rule.product_nature.trim() !== "") {
    if (
      !ctx.productNature ||
      rule.product_nature.trim() !== ctx.productNature.trim()
    ) {
      return null;
    }
    score += 1;
    matched.product_nature = rule.product_nature;
  }

  return { score, matched };
}

function ratesFromRule(rule: FiscalRuleRow): FiscalRates | null {
  const hasAny =
    rule.icms_rate != null ||
    rule.ipi_rate != null ||
    rule.pis_rate != null ||
    rule.cofins_rate != null ||
    rule.icms_st === true ||
    rule.icms_st_rate != null ||
    rule.cbs_rate != null ||
    rule.ibs_rate != null;

  if (!hasAny) return null;

  return {
    icmsRate: rule.icms_rate != null ? Number(rule.icms_rate) : 0,
    ipiRate: rule.ipi_rate != null ? Number(rule.ipi_rate) : 0,
    pisRate: rule.pis_rate != null ? Number(rule.pis_rate) : 0,
    cofinsRate: rule.cofins_rate != null ? Number(rule.cofins_rate) : 0,
    icmsSt: rule.icms_st === true,
    icmsStRate: rule.icms_st_rate != null ? Number(rule.icms_st_rate) : 0,
    cbsRate: rule.cbs_rate != null ? Number(rule.cbs_rate) : 0,
    ibsRate: rule.ibs_rate != null ? Number(rule.ibs_rate) : 0,
  };
}

function buildWarnings(rule: FiscalRuleRow, ctx: FiscalContext): string[] {
  const warnings: string[] = [];
  const dest = normUf(rule.destination_uf);
  const ctxDest = normUf(ctx.destinationUf);
  if (dest && ctxDest && dest !== ctxDest) {
    warnings.push(
      `UF destino do contexto (${ctxDest}) difere da regra (${dest}).`
    );
  }
  if (rule.ncm_pattern && !normNcm(ctx.ncm)) {
    warnings.push("Produto sem NCM — conferir regra aplicada.");
  }
  if (
    rule.icms_rate == null &&
    rule.ipi_rate == null &&
    rule.pis_rate == null &&
    rule.cofins_rate == null
  ) {
    warnings.push("Regra casou mas não tem alíquotas preenchidas.");
  }
  return warnings;
}

/** Motor determinístico: maior especificidade; empate → menor priority. */
export function resolveFiscalRule(
  rules: FiscalRuleRow[],
  ctx: FiscalContext,
  at: Date = new Date()
): FiscalRuleMatchResult {
  const active = rules.filter((r) => r.is_active && isRuleInDateRange(r, at));

  let best: FiscalRuleRow | null = null;
  let bestScore = 0;
  let bestPriority = Number.POSITIVE_INFINITY;
  let bestMatched: Record<string, string> = {};

  for (const rule of active) {
    const scored = scoreRule(rule, ctx);
    if (!scored) continue;
    const better =
      scored.score > bestScore ||
      (scored.score === bestScore && rule.priority < bestPriority);
    if (better) {
      best = rule;
      bestScore = scored.score;
      bestPriority = rule.priority;
      bestMatched = scored.matched;
    }
  }

  if (!best) {
    return {
      rule: null,
      matchScore: 0,
      matchDetail: { reason: "no_matching_rule" },
      cfop: null,
      rates: null,
      ibsCbsClassificacao: null,
      warnings: [],
      fiscalStatus: "no_rules",
    };
  }

  const rates = ratesFromRule(best);
  const warnings = buildWarnings(best, ctx);
  let fiscalStatus: FiscalStatus = rates ? "rules_applied" : "review_required";
  if (warnings.length > 0 && rates) {
    fiscalStatus = "review_required";
  }

  return {
    rule: best,
    matchScore: bestScore,
    matchDetail: {
      matched: bestMatched,
      priority: best.priority,
      rule_id: best.id,
      rule_name: best.name,
    },
    cfop: best.cfop,
    rates,
    ibsCbsClassificacao: best.ibs_cbs_classificacao,
    warnings,
    fiscalStatus,
  };
}

export function previewFiscalRules(
  rules: FiscalRuleRow[],
  ctx: FiscalContext
): Array<FiscalRuleMatchResult & { wouldMatch: boolean }> {
  const active = rules.filter((r) => r.is_active);

  return active
    .map((rule) => {
      const scored = scoreRule(rule, ctx);
      if (!scored) {
        return {
          rule,
          matchScore: 0,
          matchDetail: { would_match: false, rule_id: rule.id },
          cfop: rule.cfop,
          rates: ratesFromRule(rule),
          ibsCbsClassificacao: rule.ibs_cbs_classificacao,
          warnings: [],
          fiscalStatus: "no_rules" as FiscalStatus,
          wouldMatch: false,
        };
      }
      return { ...resolveFiscalRule([rule], ctx), wouldMatch: true };
    })
    .sort((a, b) => {
      if (a.wouldMatch !== b.wouldMatch) return a.wouldMatch ? -1 : 1;
      return b.matchScore - a.matchScore;
    });
}
