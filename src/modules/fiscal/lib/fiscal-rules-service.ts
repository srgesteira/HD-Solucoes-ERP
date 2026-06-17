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

const FISCAL_STATUS_RANK: Record<string, number> = {
  approved: 0,
  rules_applied: 1,
  manual_override: 1,
  no_rules: 2,
  pending: 2,
  review_required: 3,
};

function elevateFiscalStatus(a: string, b: string): string {
  const ra = FISCAL_STATUS_RANK[a] ?? 2;
  const rb = FISCAL_STATUS_RANK[b] ?? 2;
  return rb > ra ? b : a;
}

/** Tenta extrair a UF (2 letras maiúsculas) de uma string de endereço livre. */
function parseUfFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const m = addr.match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  if (!m) {
    const lower = addr.match(/\b([a-zA-Z]{2})\b\s*,?\s*\d{5}-?\d{3}?$/);
    if (lower?.[1]) return lower[1].toUpperCase();
    return null;
  }
  return m[1];
}

/**
 * Aplica o motor fiscal a todos os itens de um pedido de venda.
 *
 * §7.1 do documento funcional: ao efetivar o pedido, o faturamento já
 * recebe o estado fiscal calculado para conferência antecipada (paralela
 * à produção), em vez de descobrir só quando ready_for_invoice = true.
 *
 * Retorna o status agregado (pior caso) que é gravado no pedido.
 */
export async function applyFiscalToSalesOrderItems(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  appliedBy?: string | null
): Promise<{ fiscalStatus: string; itemsProcessed: number }> {
  const db = asUntypedAdmin(admin);

  const { data: order } = await admin
    .from("sales_orders")
    .select("id, client_address, quote_id")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!order) {
    return { fiscalStatus: "pending", itemsProcessed: 0 };
  }

  let destinationUf = parseUfFromAddress(order.client_address);

  if (!destinationUf && order.quote_id) {
    const { data: quote } = await admin
      .from("quotes")
      .select("customer_id")
      .eq("id", order.quote_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (quote?.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("address")
        .eq("id", quote.customer_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      destinationUf = parseUfFromAddress(customer?.address);
    }
  }

  const { data: items } = await db
    .from("sales_order_items")
    .select("id, product_id, quantity, unit_price")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);

  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return { fiscalStatus: "pending", itemsProcessed: 0 };
  }

  let aggregated = "pending";
  let processed = 0;

  for (const it of list) {
    const productId = typeof it.product_id === "string" ? it.product_id : "";
    if (!productId) continue;
    try {
      const result = await applyFiscalToLine(admin, tenantId, {
        operationType: "sale",
        documentType: "sales_order_item",
        documentLineId: String(it.id),
        productId,
        quantity: Number(it.quantity ?? 0),
        unitPrice: Number(it.unit_price ?? 0),
        customerOrSupplierUf: destinationUf,
        appliedBy: appliedBy ?? null,
      });

      if (result.taxFields) {
        await db
          .from("sales_order_items")
          .update({
            icms_rate: result.taxFields.icmsRate,
            icms_value: result.taxFields.icmsValue,
            ipi_rate: result.taxFields.ipiRate,
            ipi_value: result.taxFields.ipiValue,
            tax_base: result.taxFields.taxBase,
          })
          .eq("id", it.id)
          .eq("tenant_id", tenantId);
      }

      aggregated = elevateFiscalStatus(aggregated, result.fiscalStatus);
      processed += 1;
    } catch {
      aggregated = elevateFiscalStatus(aggregated, "review_required");
    }
  }

  await db
    .from("sales_orders")
    .update({ fiscal_status: aggregated })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);

  return { fiscalStatus: aggregated, itemsProcessed: processed };
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
