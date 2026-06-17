export const FISCAL_STATUSES = [
  "pending",
  "no_rules",
  "rules_applied",
  "manual_override",
  "review_required",
  "approved",
] as const;

export type FiscalStatus = (typeof FISCAL_STATUSES)[number];

export const FISCAL_OPERATION_TYPES = ["sale", "purchase"] as const;
export type FiscalOperationType = (typeof FISCAL_OPERATION_TYPES)[number];

export type FiscalRuleRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  operation_type: FiscalOperationType | null;
  origin_uf: string | null;
  destination_uf: string | null;
  tax_regime_id: string | null;
  company_tax_regime: string | null;
  ncm_pattern: string | null;
  product_prefix_code: string | null;
  product_nature: string | null;
  cfop: string | null;
  icms_rate: number | null;
  icms_st: boolean | null;
  icms_st_rate: number | null;
  ipi_rate: number | null;
  pis_rate: number | null;
  cofins_rate: number | null;
  cbs_rate: number | null;
  ibs_rate: number | null;
  ibs_cbs_classificacao: string | null;
  /** §7.7 — campos de manutenção (podem não existir antes da migração). */
  last_reviewed_at?: string | null;
  last_reviewed_by?: string | null;
  review_interval_months?: number | null;
};

export type FiscalContext = {
  operationType: FiscalOperationType;
  originUf: string | null;
  destinationUf: string | null;
  taxRegimeId: string | null;
  companyTaxRegime: string | null;
  ncm: string | null;
  productPrefixCode: string | null;
  productNature: string | null;
};

export type FiscalRates = {
  icmsRate: number;
  ipiRate: number;
  pisRate: number;
  cofinsRate: number;
  icmsSt: boolean;
  icmsStRate: number;
  cbsRate: number;
  ibsRate: number;
};

export type FiscalRuleMatchResult = {
  rule: FiscalRuleRow | null;
  matchScore: number;
  matchDetail: Record<string, unknown>;
  cfop: string | null;
  rates: FiscalRates | null;
  ibsCbsClassificacao: string | null;
  warnings: string[];
  fiscalStatus: FiscalStatus;
};

export function isFiscalReadyForInvoice(
  readyForInvoice: boolean,
  fiscalStatus: FiscalStatus
): boolean {
  return (
    readyForInvoice &&
    (fiscalStatus === "rules_applied" ||
      fiscalStatus === "manual_override" ||
      fiscalStatus === "approved")
  );
}

export const FISCAL_STATUS_LABELS: Record<FiscalStatus, string> = {
  pending: "Fiscal pendente",
  no_rules: "Sem regra fiscal",
  rules_applied: "Regra aplicada",
  manual_override: "Impostos manuais",
  review_required: "Revisão fiscal",
  approved: "Fiscal aprovado",
};
