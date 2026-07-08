import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { taxAmountFromRate, recalcLineTaxAmounts } from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import {
  applyFiscalToLine,
  applyFiscalToSalesOrderItems,
  parseUfFromAddress,
} from "@/modules/fiscal/lib/fiscal-rules-service";
import {
  FISCAL_STATUS_LABELS,
  isFiscalConfigured,
  type FiscalRates,
  type FiscalStatus,
} from "@/modules/fiscal/lib/fiscal-rules-types";
import { recalculateSalesOrderHeaderTotals } from "@/modules/vendas/lib/sales/sales-order-totals";

type Admin = SupabaseClient<Database>;

export type FiscalItemSource = "applied" | "preview" | "stored" | "manual" | "none";

export type FiscalOrderReviewItem = {
  id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  product_id: string | null;
  product_name: string | null;
  ncm: string | null;
  product_nature: string | null;
  cfop: string | null;
  fiscal_rule_id: string | null;
  fiscal_rule_name: string | null;
  fiscal_source: FiscalItemSource;
  fiscal_source_label: string;
  tax_base: number | null;
  icms_rate: number | null;
  icms_value: number | null;
  icms_st: boolean | null;
  icms_st_rate: number | null;
  ipi_rate: number | null;
  ipi_value: number | null;
  pis_rate: number | null;
  pis_value: number | null;
  cofins_rate: number | null;
  cofins_value: number | null;
  cbs_rate: number | null;
  ibs_rate: number | null;
  ibs_cbs_classificacao: string | null;
  line_warnings: string[];
};

export type FiscalOrderReview = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  client_name: string;
  client_document: string | null;
  client_address: string | null;
  origin_uf: string | null;
  destination_uf: string | null;
  tax_regime: string | null;
  total: number;
  total_icms: number;
  total_ipi: number;
  total_tax_base: number;
  fiscal_status: string;
  fiscal_status_label: string;
  fiscal_configured: boolean;
  ready_for_invoice: boolean;
  billing_plan: string | null;
  billing_closure: string | null;
  notes: string | null;
  items: FiscalOrderReviewItem[];
  warnings: string[];
};

type RawOrderRow = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  client_name: string;
  client_document: string | null;
  client_address: string | null;
  total: number | null;
  total_icms: number | null;
  total_ipi: number | null;
  total_tax_base: number | null;
  fiscal_status: string | null;
  ready_for_invoice: boolean | null;
  billing_plan: string | null;
  billing_closure: string | null;
  notes: string | null;
  items?: unknown;
};

type FiscalApplicationRow = {
  document_line_id: string;
  fiscal_rule_id: string | null;
  applied_at: string;
  source?: string | null;
  output_snapshot: unknown;
  match_detail: unknown;
  fiscal_rule?: { name?: string; cfop?: string | null } | null;
};

type ParsedFiscalOutput = {
  cfop: string | null;
  rates: FiscalRates | null;
  ibs_cbs_classificacao: string | null;
  tax_base: number | null;
  icms_rate: number | null;
  icms_value: number | null;
  ipi_rate: number | null;
  ipi_value: number | null;
  warnings: string[];
  rule_name: string | null;
};

const SOURCE_LABELS: Record<FiscalItemSource, string> = {
  applied: "Regra aplicada",
  preview: "Sugestão (motor fiscal)",
  stored: "Gravado no item",
  manual: "Edição manual",
  none: "Sem dados fiscais",
};

export type ManualFiscalItemInput = {
  cfop: string;
  icms_rate: number;
  icms_value?: number | null;
  ipi_rate: number;
  ipi_value?: number | null;
  tax_base?: number | null;
  pis_rate?: number;
  cofins_rate?: number;
  icms_st?: boolean;
  icms_st_rate?: number;
  cbs_rate?: number;
  ibs_rate?: number;
  ibs_cbs_classificacao?: string | null;
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseRates(raw: unknown): FiscalRates | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    icmsRate: Number(r.icmsRate ?? r.icms_rate ?? 0),
    ipiRate: Number(r.ipiRate ?? r.ipi_rate ?? 0),
    pisRate: Number(r.pisRate ?? r.pis_rate ?? 0),
    cofinsRate: Number(r.cofinsRate ?? r.cofins_rate ?? 0),
    icmsSt: Boolean(r.icmsSt ?? r.icms_st),
    icmsStRate: Number(r.icmsStRate ?? r.icms_st_rate ?? 0),
    cbsRate: Number(r.cbsRate ?? r.cbs_rate ?? 0),
    ibsRate: Number(r.ibsRate ?? r.ibs_rate ?? 0),
  };
}

function parseFiscalOutput(
  output: unknown,
  matchDetail: unknown,
  rule?: { name?: string; cfop?: string | null } | null
): ParsedFiscalOutput {
  const out =
    output && typeof output === "object" ? (output as Record<string, unknown>) : {};
  const detail =
    matchDetail && typeof matchDetail === "object"
      ? (matchDetail as Record<string, unknown>)
      : {};

  const rates = parseRates(out.rates);
  const taxFields =
    out.tax_fields && typeof out.tax_fields === "object"
      ? (out.tax_fields as Record<string, unknown>)
      : null;

  const cfop =
    strOrNull(out.cfop) ?? strOrNull(rule?.cfop) ?? null;

  const taxBase = numOrNull(taxFields?.taxBase ?? taxFields?.tax_base);
  const icmsRate = numOrNull(taxFields?.icmsRate ?? taxFields?.icms_rate) ?? rates?.icmsRate ?? null;
  const icmsValue = numOrNull(taxFields?.icmsValue ?? taxFields?.icms_value);
  const ipiRate = numOrNull(taxFields?.ipiRate ?? taxFields?.ipi_rate) ?? rates?.ipiRate ?? null;
  const ipiValue = numOrNull(taxFields?.ipiValue ?? taxFields?.ipi_value);

  const warnings = Array.isArray(out.warnings)
    ? out.warnings.filter((w): w is string => typeof w === "string")
    : [];

  const ruleName =
    strOrNull(rule?.name) ??
    strOrNull(detail.rule_name) ??
    null;

  return {
    cfop,
    rates,
    ibs_cbs_classificacao: strOrNull(out.ibs_cbs_classificacao),
    tax_base: taxBase,
    icms_rate: icmsRate,
    icms_value: icmsValue,
    ipi_rate: ipiRate,
    ipi_value: ipiValue,
    warnings,
    rule_name: ruleName,
  };
}

async function loadLatestApplicationsByLine(
  admin: Admin,
  tenantId: string,
  lineIds: string[]
): Promise<Map<string, FiscalApplicationRow>> {
  const map = new Map<string, FiscalApplicationRow>();
  if (lineIds.length === 0) return map;

  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("fiscal_rule_applications")
    .select(
      `
      document_line_id,
      fiscal_rule_id,
      applied_at,
      source,
      output_snapshot,
      match_detail,
      fiscal_rule:fiscal_rules(name, cfop)
    `
    )
    .eq("tenant_id", tenantId)
    .eq("document_type", "sales_order_item")
    .in("document_line_id", lineIds)
    .order("applied_at", { ascending: false });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as FiscalApplicationRow[]) {
    if (!map.has(row.document_line_id)) {
      map.set(row.document_line_id, row);
    }
  }
  return map;
}

function buildItemFiscalFields(opts: {
  stored: {
    icms_rate: number | null;
    icms_value: number | null;
    ipi_rate: number | null;
    ipi_value: number | null;
    tax_base: number | null;
  };
  parsed: ParsedFiscalOutput | null;
  previewRates: FiscalRates | null;
  previewCfop: string | null;
  previewRuleName: string | null;
  previewWarnings: string[];
  fiscalRuleId: string | null;
  source: FiscalItemSource;
  quantity: number;
  unitPrice: number;
}): Omit<
  FiscalOrderReviewItem,
  | "id"
  | "line_number"
  | "description"
  | "quantity"
  | "unit"
  | "unit_price"
  | "total_price"
  | "product_id"
  | "product_name"
  | "ncm"
  | "product_nature"
> {
  const rates =
    opts.parsed?.rates ??
    opts.previewRates ??
    (opts.stored.icms_rate != null || opts.stored.ipi_rate != null
      ? {
          icmsRate: opts.stored.icms_rate ?? 0,
          ipiRate: opts.stored.ipi_rate ?? 0,
          pisRate: 0,
          cofinsRate: 0,
          icmsSt: false,
          icmsStRate: 0,
          cbsRate: 0,
          ibsRate: 0,
        }
      : null);

  const taxBase =
    opts.parsed?.tax_base ??
    opts.stored.tax_base ??
    (opts.stored.icms_value != null || opts.stored.ipi_value != null
      ? opts.quantity * opts.unitPrice + (opts.stored.ipi_value ?? 0)
      : null);

  const icmsRate = opts.parsed?.icms_rate ?? opts.stored.icms_rate ?? rates?.icmsRate ?? null;
  const icmsValue = opts.parsed?.icms_value ?? opts.stored.icms_value ?? null;
  const ipiRate = opts.parsed?.ipi_rate ?? opts.stored.ipi_rate ?? rates?.ipiRate ?? null;
  const ipiValue = opts.parsed?.ipi_value ?? opts.stored.ipi_value ?? null;

  const baseForPisCofins = taxBase ?? 0;
  const pisRate = rates?.pisRate ?? null;
  const cofinsRate = rates?.cofinsRate ?? null;

  return {
    cfop: opts.parsed?.cfop ?? opts.previewCfop ?? null,
    fiscal_rule_id: opts.fiscalRuleId,
    fiscal_rule_name: opts.parsed?.rule_name ?? opts.previewRuleName ?? null,
    fiscal_source: opts.source,
    fiscal_source_label: SOURCE_LABELS[opts.source],
    tax_base: taxBase,
    icms_rate: icmsRate,
    icms_value: icmsValue,
    icms_st: rates?.icmsSt ?? null,
    icms_st_rate: rates?.icmsStRate ?? null,
    ipi_rate: ipiRate,
    ipi_value: ipiValue,
    pis_rate: pisRate,
    pis_value:
      pisRate != null && baseForPisCofins > 0
        ? taxAmountFromRate(baseForPisCofins, pisRate)
        : null,
    cofins_rate: cofinsRate,
    cofins_value:
      cofinsRate != null && baseForPisCofins > 0
        ? taxAmountFromRate(baseForPisCofins, cofinsRate)
        : null,
    cbs_rate: rates?.cbsRate ?? null,
    ibs_rate: rates?.ibsRate ?? null,
    ibs_cbs_classificacao: opts.parsed?.ibs_cbs_classificacao ?? null,
    line_warnings: [...(opts.parsed?.warnings ?? []), ...opts.previewWarnings],
  };
}

export async function getFiscalOrderReview(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<FiscalOrderReview | null> {
  const db = asUntypedAdmin(admin);

  const [{ data: company }, orderResult] = await Promise.all([
    admin
      .from("company_settings")
      .select("address_state, tax_regime")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    // billing_plan / billing_closure: pós-migração
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from("sales_orders") as any)
      .select(
        `
      id,
      order_number,
      status,
      order_date,
      client_name,
      client_document,
      client_address,
      total,
      total_icms,
      total_ipi,
      total_tax_base,
      fiscal_status,
      ready_for_invoice,
      billing_plan,
      billing_closure,
      notes,
      items:sales_order_items(
        id,
        line_number,
        description,
        quantity,
        unit,
        unit_price,
        total_price,
        product_id,
        icms_rate,
        icms_value,
        ipi_rate,
        ipi_value,
        tax_base,
        product:products!sales_order_items_product_id_fkey(name, ncm, product_nature)
      )
    `
      )
      .eq("id", salesOrderId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const { data, error } = orderResult;
  if (error) throw new Error(error.message);
  if (!data) return null;

  const order = data as RawOrderRow;
  const destinationUf = parseUfFromAddress(order.client_address);
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const lineIds = rawItems.map((it: Record<string, unknown>) => String(it.id));
  const applications = await loadLatestApplicationsByLine(admin, tenantId, lineIds);

  const items: FiscalOrderReviewItem[] = [];

  for (const raw of rawItems) {
    const it = raw as Record<string, unknown>;
    const product =
      it.product && typeof it.product === "object"
        ? (it.product as Record<string, unknown>)
        : null;
    const lineId = String(it.id);
    const productId = typeof it.product_id === "string" ? it.product_id : null;
    const quantity = Number(it.quantity ?? 0);
    const unitPrice = Number(it.unit_price ?? 0);

    const stored = {
      icms_rate: numOrNull(it.icms_rate),
      icms_value: numOrNull(it.icms_value),
      ipi_rate: numOrNull(it.ipi_rate),
      ipi_value: numOrNull(it.ipi_value),
      tax_base: numOrNull(it.tax_base),
    };

    const app = applications.get(lineId);
    let source: FiscalItemSource = "none";
    let parsed: ParsedFiscalOutput | null = null;
    let previewRates: FiscalRates | null = null;
    let previewCfop: string | null = null;
    let previewRuleName: string | null = null;
    let previewWarnings: string[] = [];
    let fiscalRuleId: string | null = null;

    if (app) {
      source = app.source === "manual_override" ? "manual" : "applied";
      fiscalRuleId = app.fiscal_rule_id;
      const ruleRow = Array.isArray(app.fiscal_rule)
        ? app.fiscal_rule[0]
        : app.fiscal_rule;
      parsed = parseFiscalOutput(
        app.output_snapshot,
        app.match_detail,
        ruleRow ?? null
      );
    } else if (productId) {
      try {
        const preview = await applyFiscalToLine(admin, tenantId, {
          operationType: "sale",
          documentType: "sales_order_item",
          documentLineId: lineId,
          productId,
          quantity,
          unitPrice,
          customerOrSupplierUf: destinationUf,
          preview: true,
        });
        if (preview.match.rates || preview.match.cfop) {
          source = "preview";
          previewRates = preview.match.rates;
          previewCfop = preview.match.cfop;
          previewRuleName =
            typeof preview.match.matchDetail?.rule_name === "string"
              ? preview.match.matchDetail.rule_name
              : preview.match.rule?.name ?? null;
          fiscalRuleId = preview.match.rule?.id ?? null;
          previewWarnings = preview.match.warnings ?? [];
        }
      } catch {
        previewWarnings = ["Erro ao simular regra fiscal para este item."];
      }
    }

    if (
      source === "none" &&
      (stored.icms_rate != null ||
        stored.ipi_rate != null ||
        stored.icms_value != null)
    ) {
      source = "stored";
    }

    const fiscalFields = buildItemFiscalFields({
      stored,
      parsed,
      previewRates,
      previewCfop,
      previewRuleName,
      previewWarnings,
      fiscalRuleId,
      source,
      quantity,
      unitPrice,
    });

    items.push({
      id: lineId,
      line_number: Number(it.line_number ?? 0),
      description: String(it.description ?? ""),
      quantity,
      unit: String(it.unit ?? "UN"),
      unit_price: unitPrice,
      total_price: Number(it.total_price ?? 0),
      product_id: productId,
      product_name:
        product && typeof product.name === "string" ? product.name : null,
      ncm: product && typeof product.ncm === "string" ? product.ncm : null,
      product_nature:
        product && typeof product.product_nature === "string"
          ? product.product_nature
          : null,
      ...fiscalFields,
    });
  }

  items.sort((a, b) => a.line_number - b.line_number);

  const fiscalStatus = String(order.fiscal_status ?? "pending");
  const statusKey = (
    fiscalStatus in FISCAL_STATUS_LABELS ? fiscalStatus : "pending"
  ) as FiscalStatus;

  const warnings: string[] = [];
  if (items.length === 0) {
    warnings.push("Pedido sem itens.");
  }
  if (items.some((it) => !it.product_id)) {
    warnings.push(
      "Há itens sem produto vinculado — associe o produto com NCM para aplicar regras automaticamente."
    );
  }
  if (items.some((it) => it.product_id && !it.ncm)) {
    warnings.push(
      "Há produtos sem NCM cadastrado — complete o cadastro em Engenharia/Produtos."
    );
  }
  if (items.some((it) => !it.cfop)) {
    warnings.push(
      "Há itens sem CFOP definido — cadastre regras fiscais ou reaplique o motor fiscal."
    );
  }
  if (items.some((it) => it.fiscal_source === "preview")) {
    warnings.push(
      "Alguns itens mostram apenas sugestão do motor — clique em «Reaplicar regras» para gravar CFOP e alíquotas."
    );
  }
  if (!isFiscalConfigured(fiscalStatus)) {
    warnings.push(
      "Fiscal ainda não está alinhado. Use o assistente (IA) ou marque «Fiscal alinhado» após conferir os dados."
    );
  }

  return {
    id: String(order.id),
    order_number: String(order.order_number),
    status: String(order.status),
    order_date: String(order.order_date),
    client_name: String(order.client_name),
    client_document:
      typeof order.client_document === "string" ? order.client_document : null,
    client_address:
      typeof order.client_address === "string" ? order.client_address : null,
    origin_uf: company?.address_state ?? null,
    destination_uf: destinationUf,
    tax_regime: company?.tax_regime ?? null,
    total: Number(order.total ?? 0),
    total_icms: Number(order.total_icms ?? 0),
    total_ipi: Number(order.total_ipi ?? 0),
    total_tax_base: Number(order.total_tax_base ?? 0),
    fiscal_status: fiscalStatus,
    fiscal_status_label: FISCAL_STATUS_LABELS[statusKey],
    fiscal_configured: isFiscalConfigured(fiscalStatus),
    ready_for_invoice: order.ready_for_invoice === true,
    billing_plan:
      typeof order.billing_plan === "string" ? order.billing_plan : null,
    billing_closure:
      typeof order.billing_closure === "string" ? order.billing_closure : null,
    notes: typeof order.notes === "string" ? order.notes : null,
    items,
    warnings,
  };
}

/** Marca o pedido como fiscalmente alinhado (impostos conferidos / sem nota). */
export async function markSalesOrderFiscalAligned(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const db = asUntypedAdmin(admin);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("sales_orders") as any)
    .select("id, status, billing_closure, fiscal_status")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reasons: ["Pedido não encontrado."] };

  const row = data as {
    id: string;
    status: string;
    billing_closure: string | null;
    fiscal_status: string | null;
  };

  if (row.billing_closure) {
    return { ok: false, reasons: ["Pedido já finalizado no faturamento."] };
  }
  if (row.status === "cancelled") {
    return { ok: false, reasons: ["Pedido cancelado."] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (db.from("sales_orders") as any)
    .update({ fiscal_status: "manual_override" })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);
  return { ok: true };
}

/** Reaplica o motor de regras fiscais a todos os itens do pedido. */
export async function reapplyFiscalRulesToSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  appliedBy?: string | null
): Promise<{ itemsProcessed: number; fiscalStatus: string }> {
  const result = await applyFiscalToSalesOrderItems(
    admin,
    tenantId,
    salesOrderId,
    appliedBy ?? null
  );
  if (result.itemsProcessed === 0) {
    throw new Error(
      "Nenhum item com produto vinculado — associe produtos com NCM antes de reaplicar."
    );
  }
  return result;
}

function parseManualItemInput(raw: unknown): ManualFiscalItemInput | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const cfop = typeof b.cfop === "string" ? b.cfop.trim() : "";
  if (!cfop || !/^\d{4}$/.test(cfop)) return null;

  const num = (k: string, fallback = 0) => {
    const v = Number(b[k]);
    return Number.isFinite(v) ? v : fallback;
  };

  return {
    cfop,
    icms_rate: num("icms_rate"),
    icms_value: b.icms_value == null ? null : num("icms_value"),
    ipi_rate: num("ipi_rate"),
    ipi_value: b.ipi_value == null ? null : num("ipi_value"),
    tax_base: b.tax_base == null ? null : num("tax_base"),
    pis_rate: num("pis_rate"),
    cofins_rate: num("cofins_rate"),
    icms_st: Boolean(b.icms_st),
    icms_st_rate: num("icms_st_rate"),
    cbs_rate: num("cbs_rate"),
    ibs_rate: num("ibs_rate"),
    ibs_cbs_classificacao:
      typeof b.ibs_cbs_classificacao === "string"
        ? b.ibs_cbs_classificacao.trim() || null
        : null,
  };
}

/** Grava CFOP e alíquotas manualmente num item do pedido. */
export async function saveManualFiscalItemOverride(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  itemId: string,
  input: ManualFiscalItemInput,
  appliedBy?: string | null
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const db = asUntypedAdmin(admin);

  const { data: item, error: itemErr } = await admin
    .from("sales_order_items")
    .select("id, sales_order_id, quantity, unit_price")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (itemErr) throw new Error(itemErr.message);
  if (!item || item.sales_order_id !== salesOrderId) {
    return { ok: false, reasons: ["Item do pedido não encontrado."] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (db.from("sales_orders") as any)
    .select("id, status, billing_closure")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!order) return { ok: false, reasons: ["Pedido não encontrado."] };
  if (order.billing_closure) {
    return { ok: false, reasons: ["Pedido já finalizado no faturamento."] };
  }
  if (order.status === "cancelled") {
    return { ok: false, reasons: ["Pedido cancelado."] };
  }

  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unit_price ?? 0);

  const taxFields = recalcLineTaxAmounts(
    quantity,
    unitPrice,
    {
      icmsRate: input.icms_rate,
      icmsValue: input.icms_value ?? 0,
      ipiRate: input.ipi_rate,
      ipiValue: input.ipi_value ?? 0,
      taxBase: input.tax_base ?? 0,
    },
    input.icms_value != null || input.ipi_value != null || input.tax_base != null
      ? "none"
      : "both"
  );

  const { error: updErr } = await admin
    .from("sales_order_items")
    .update({
      icms_rate: taxFields.icmsRate,
      icms_value: taxFields.icmsValue,
      ipi_rate: taxFields.ipiRate,
      ipi_value: taxFields.ipiValue,
      tax_base: taxFields.taxBase,
    })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);

  const rates: FiscalRates = {
    icmsRate: taxFields.icmsRate,
    ipiRate: taxFields.ipiRate,
    pisRate: input.pis_rate ?? 0,
    cofinsRate: input.cofins_rate ?? 0,
    icmsSt: input.icms_st ?? false,
    icmsStRate: input.icms_st_rate ?? 0,
    cbsRate: input.cbs_rate ?? 0,
    ibsRate: input.ibs_rate ?? 0,
  };

  const { error: appErr } = await db.from("fiscal_rule_applications").insert({
    tenant_id: tenantId,
    document_type: "sales_order_item",
    document_line_id: itemId,
    fiscal_rule_id: null,
    match_score: 100,
    match_detail: {
      reason: "manual_override",
      source: "fiscal_review",
      rule_name: "Edição manual",
    },
    input_snapshot: { sales_order_id: salesOrderId, item_id: itemId },
    output_snapshot: {
      cfop: input.cfop,
      rates,
      ibs_cbs_classificacao: input.ibs_cbs_classificacao,
      tax_fields: taxFields,
      warnings: [],
    },
    source: "manual_override",
    applied_by: appliedBy ?? null,
  });

  if (appErr) throw new Error(appErr.message);

  const totals = await recalculateSalesOrderHeaderTotals(
    admin,
    tenantId,
    salesOrderId
  );
  if (totals.error) throw new Error(totals.error);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: stErr } = await (db.from("sales_orders") as any)
    .update({ fiscal_status: "manual_override" })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (stErr) throw new Error(stErr.message);

  return { ok: true };
}

export { parseManualItemInput };
