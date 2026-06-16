import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  recalcLineTaxAmounts,
  type PurchaseLineTaxFields,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { resolveFiscalRule } from "@/modules/fiscal/lib/fiscal-rules-engine";
import type {
  FiscalContext,
  FiscalOperationType,
  FiscalRuleRow,
} from "@/modules/fiscal/lib/fiscal-rules-types";

type Admin = SupabaseClient<Database>;

export type ApplyFiscalLineInput = {
  operationType: FiscalOperationType;
  documentType: "sales_order_item" | "purchase_order_item";
  documentLineId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  customerOrSupplierUf?: string | null;
  preview?: boolean;
  appliedBy?: string | null;
};

export type ApplyFiscalLineResult = {
  match: ReturnType<typeof resolveFiscalRule>;
  taxFields: PurchaseLineTaxFields | null;
  fiscalStatus: string;
};

async function loadActiveRules(
  admin: Admin,
  tenantId: string
): Promise<FiscalRuleRow[]> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("fiscal_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as FiscalRuleRow[];
}

async function buildFiscalContext(
  admin: Admin,
  tenantId: string,
  input: ApplyFiscalLineInput
): Promise<FiscalContext> {
  const { data: company } = await admin
    .from("company_settings")
    .select("address_state, tax_regime")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: defaultRegime } = await admin
    .from("tax_regimes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();

  const { data: product } = await admin
    .from("products")
    .select(
      "ncm, product_nature, prefix:product_prefixes(code)"
    )
    .eq("id", input.productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const rawPrefix = product?.prefix as
    | { code?: string }
    | { code?: string }[]
    | null
    | undefined;
  const prefixRow = Array.isArray(rawPrefix) ? rawPrefix[0] : rawPrefix;

  return {
    operationType: input.operationType,
    originUf: company?.address_state ?? null,
    destinationUf: input.customerOrSupplierUf ?? null,
    taxRegimeId: defaultRegime?.id ?? null,
    companyTaxRegime: company?.tax_regime ?? null,
    ncm: product?.ncm ?? null,
    productPrefixCode: prefixRow?.code ?? null,
    productNature: product?.product_nature ?? null,
  };
}

export async function applyFiscalToLine(
  admin: Admin,
  tenantId: string,
  input: ApplyFiscalLineInput
): Promise<ApplyFiscalLineResult> {
  const rules = await loadActiveRules(admin, tenantId);
  const ctx = await buildFiscalContext(admin, tenantId, input);
  const match = resolveFiscalRule(rules, ctx);

  let taxFields: PurchaseLineTaxFields | null = null;
  if (match.rates) {
    taxFields = recalcLineTaxAmounts(
      input.quantity,
      input.unitPrice,
      {
        icmsRate: match.rates.icmsRate,
        icmsValue: 0,
        ipiRate: match.rates.ipiRate,
        ipiValue: 0,
        taxBase: 0,
      },
      "both"
    );
  }

  if (!input.preview) {
    const db = asUntypedAdmin(admin);
    await db.from("fiscal_rule_applications").insert({
      tenant_id: tenantId,
      document_type: input.documentType,
      document_line_id: input.documentLineId,
      fiscal_rule_id: match.rule?.id ?? null,
      match_score: match.matchScore,
      match_detail: match.matchDetail,
      input_snapshot: ctx,
      output_snapshot: {
        cfop: match.cfop,
        rates: match.rates,
        ibs_cbs_classificacao: match.ibsCbsClassificacao,
        tax_fields: taxFields,
        warnings: match.warnings,
      },
      source: "auto",
      applied_by: input.appliedBy ?? null,
    });
  }

  return {
    match,
    taxFields,
    fiscalStatus: match.fiscalStatus,
  };
}

export async function listFiscalRules(
  admin: Admin,
  tenantId: string
): Promise<FiscalRuleRow[]> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("fiscal_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as FiscalRuleRow[];
}
