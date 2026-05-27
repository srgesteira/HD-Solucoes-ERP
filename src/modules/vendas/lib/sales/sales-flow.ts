import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  lineSubtotal,
  parseTaxAmount,
  parseTaxRate,
  parseTaxValueField,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { recalculateSalesOrderHeaderTotals } from "@/modules/vendas/lib/sales/sales-order-totals";

export type AdminClient = SupabaseClient<Database>;

/** Linhas de produto em orçamento / pedido (payload da API). */
export type SaleLineInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  markup_percent?: number | null;
  icms_rate?: number;
  icms_value?: number;
  ipi_rate?: number;
  ipi_value?: number;
  tax_base?: number;
};

export function addDaysToISODate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Prazo sugerido quando `expected_delivery` ainda não foi gravado. */
export function defaultExpectedDeliveryForOrder(
  orderDate: string | null | undefined,
  fallbackDays = 30
): string {
  const base =
    orderDate && String(orderDate).slice(0, 10).length >= 10
      ? String(orderDate).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  return addDaysToISODate(base, fallbackDays);
}

/** Reparte total em N parcelas (centavos) sem erro de soma. */
export function splitAmountInInstallments(total: number, n: number): number[] {
  if (n <= 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const baseCents = Math.floor(cents / n);
  const remainder = cents - baseCents * n;
  const parts: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = i < remainder ? 1 : 0;
    parts.push((baseCents + extra) / 100);
  }
  return parts;
}

export async function nextQuoteNumber(
  admin: AdminClient,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORC-${year}-`;
  const { data, error } = await admin
    .from("quotes")
    .select("quote_number")
    .eq("tenant_id", tenantId)
    .like("quote_number", `${prefix}%`)
    .order("quote_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.quote_number;
  let next = 1;
  if (last?.startsWith(prefix)) {
    const suf = last.slice(prefix.length);
    const num = parseInt(suf, 10);
    if (Number.isFinite(num)) next = num + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function nextSalesOrderNumber(
  admin: AdminClient,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PV-${year}-`;
  const { data, error } = await admin
    .from("sales_orders")
    .select("order_number")
    .eq("tenant_id", tenantId)
    .like("order_number", `${prefix}%`)
    .order("order_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.order_number;
  let next = 1;
  if (last?.startsWith(prefix)) {
    const suf = last.slice(prefix.length);
    const num = parseInt(suf, 10);
    if (Number.isFinite(num)) next = num + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Valida payload `items`; retorna linhas ou mensagem PT. */
export function parseSaleLines(raw: unknown):
  | { ok: true; lines: SaleLineInput[] }
  | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, lines: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, message: "items deve ser um array" };
  }

  const lines: SaleLineInput[] = [];

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, message: `Item ${i + 1}: formato inválido` };
    }
    const r = row as Record<string, unknown>;

    const description =
      typeof r.description === "string" ? r.description.trim() : "";
    if (!description) {
      return {
        ok: false,
        message: `Item ${i + 1}: descrição é obrigatória`,
      };
    }

    const qtyRaw = r.quantity;
    const quantity =
      typeof qtyRaw === "number"
        ? qtyRaw
        : typeof qtyRaw === "string"
          ? parseFloat(qtyRaw.replace(",", "."))
          : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false,
        message: `Item ${i + 1}: quantidade inválida`,
      };
    }

    const unit_price =
      r.unit_price === undefined || r.unit_price === null
        ? 0
        : typeof r.unit_price === "number"
          ? r.unit_price
          : parseFloat(String(r.unit_price).replace(",", "."));

    if (!Number.isFinite(unit_price) || unit_price < 0) {
      return {
        ok: false,
        message: `Item ${i + 1}: preço unitário inválido`,
      };
    }

    const unit =
      r.unit !== undefined && r.unit !== null && String(r.unit).trim()
        ? String(r.unit).trim()
        : "UN";

    const product_id =
      r.product_id === undefined || r.product_id === null
        ? null
        : String(r.product_id);

    let markup_percent: number | null = null;
    if (r.markup_percent !== undefined && r.markup_percent !== null) {
      const mp =
        typeof r.markup_percent === "number"
          ? r.markup_percent
          : parseFloat(String(r.markup_percent).replace(",", "."));
      if (Number.isFinite(mp) && mp >= 0) markup_percent = mp;
    }

    const icms_rate =
      r.icms_rate === undefined || r.icms_rate === null
        ? 0
        : parseTaxRate(r.icms_rate);
    if (icms_rate === null) {
      return { ok: false, message: `Item ${i + 1}: alíquota ICMS inválida.` };
    }

    const ipi_rate =
      r.ipi_rate === undefined || r.ipi_rate === null
        ? 0
        : parseTaxRate(r.ipi_rate);
    if (ipi_rate === null) {
      return { ok: false, message: `Item ${i + 1}: alíquota IPI inválida.` };
    }

    const icms_value =
      parseTaxValueField(r, "icms_value", "icms_amount") === undefined ||
      parseTaxValueField(r, "icms_value", "icms_amount") === null
        ? 0
        : parseTaxAmount(parseTaxValueField(r, "icms_value", "icms_amount"));
    if (icms_value === null) {
      return { ok: false, message: `Item ${i + 1}: valor ICMS inválido.` };
    }

    const ipi_value =
      parseTaxValueField(r, "ipi_value", "ipi_amount") === undefined ||
      parseTaxValueField(r, "ipi_value", "ipi_amount") === null
        ? 0
        : parseTaxAmount(parseTaxValueField(r, "ipi_value", "ipi_amount"));
    if (ipi_value === null) {
      return { ok: false, message: `Item ${i + 1}: valor IPI inválido.` };
    }

    const sub = lineSubtotal(quantity, unit_price);
    const tax_base =
      r.tax_base === undefined || r.tax_base === null
        ? roundMoney(sub + ipi_value)
        : parseTaxAmount(r.tax_base);
    if (tax_base === null) {
      return { ok: false, message: `Item ${i + 1}: base de cálculo inválida.` };
    }

    lines.push({
      description,
      quantity,
      unit_price,
      unit,
      product_id,
      markup_percent,
      icms_rate,
      icms_value,
      ipi_rate,
      ipi_value,
      tax_base,
    });
  }

  return { ok: true, lines };
}

function saleLineToDbRow(
  it: SaleLineInput,
  idx: number,
  startLine: number,
  tenantId: string,
  salesOrderId: string,
  unitCost: number | null
) {
  const sub = lineSubtotal(it.quantity, it.unit_price);
  const ipiVal = roundMoney(it.ipi_value ?? 0);
  const taxBase = roundMoney(it.tax_base ?? sub + ipiVal);
  const totalPrice = roundMoney(sub + ipiVal);

  return {
    tenant_id: tenantId,
    sales_order_id: salesOrderId,
    line_number: startLine + idx,
    product_id: it.product_id,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit ?? "UN",
    unit_price: it.unit_price,
    unit_cost: unitCost,
    total_price: totalPrice,
    icms_rate: it.icms_rate ?? 0,
    icms_value: it.icms_value ?? 0,
    ipi_rate: it.ipi_rate ?? 0,
    ipi_value: ipiVal,
    tax_base: taxBase,
  };
}

async function fetchProductCosts(
  admin: AdminClient,
  tenantId: string,
  lines: SaleLineInput[]
): Promise<Map<string, number>> {
  const ids = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
  const map = new Map<string, number>();
  if (ids.length === 0) return map;

  const { data, error } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (error) throw error;

  for (const p of data ?? []) {
    map.set(p.id, p.cost_price);
  }
  return map;
}

export async function insertSalesOrderItemsFromLines(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  lines: SaleLineInput[]
): Promise<{ error?: string }> {
  if (!lines.length) return {};

  const { data: lastLine } = await admin
    .from("sales_order_items")
    .select("line_number")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startLine = (lastLine?.line_number ?? 0) + 1;

  const costs = await fetchProductCosts(admin, tenantId, lines);

  const rows = lines.map((it, idx) => {
    const pid = it.product_id;
    const uc = pid != null ? (costs.get(pid) ?? null) : null;
    return saleLineToDbRow(it, idx, startLine, tenantId, salesOrderId, uc);
  });

  const { error } = await admin.from("sales_order_items").insert(rows);
  if (error) return { error: error.message };

  const totals = await recalculateSalesOrderHeaderTotals(
    admin,
    tenantId,
    salesOrderId
  );
  if (totals.error) return { error: totals.error };
  return {};
}

export async function insertQuoteItemsFromLines(
  admin: AdminClient,
  tenantId: string,
  quoteId: string,
  lines: SaleLineInput[]
): Promise<{ error?: string }> {
  if (!lines.length) return {};
  const rows = lines.map((it) => ({
    tenant_id: tenantId,
    quote_id: quoteId,
    product_id: it.product_id,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit ?? "UN",
    unit_price: it.unit_price,
    markup_percent: it.markup_percent ?? null,
  }));
  const { error } = await admin.from("quote_items").insert(rows);
  if (error) return { error: error.message };
  return {};
}

/** Substitui todos os itens de um orçamento (rascunho). */
export async function replaceQuoteItemsFromLines(
  admin: AdminClient,
  tenantId: string,
  quoteId: string,
  lines: SaleLineInput[]
): Promise<{ error?: string }> {
  const { error: delErr } = await admin
    .from("quote_items")
    .delete()
    .eq("quote_id", quoteId)
    .eq("tenant_id", tenantId);

  if (delErr) return { error: delErr.message };
  if (!lines.length) return {};
  return insertQuoteItemsFromLines(admin, tenantId, quoteId, lines);
}

/** Gera parcelas só se total > 0 e ainda não existir título para o pedido. */
export async function generateReceivablesForSalesOrder(
  admin: AdminClient,
  tenantId: string,
  order: {
    id: string;
    order_number: string;
    order_date: string;
    total: number;
    client_name: string;
    client_document: string | null;
    payment_installments: number;
    payment_days_to_first_due: number;
    payment_days_between_installments: number;
  }
): Promise<{ error?: string }> {
  if (order.total <= 0) return {};

  const { count, error: cErr } = await admin
    .from("receivables")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", order.id);

  if (cErr) return { error: cErr.message };
  if ((count ?? 0) > 0) return {};

  const n = Math.max(1, Math.min(999, order.payment_installments));
  const amounts = splitAmountInInstallments(order.total, n);
  const baseDate = order.order_date.slice(0, 10);

  let due = addDaysToISODate(baseDate, order.payment_days_to_first_due);
  const rows = [];

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      due = addDaysToISODate(
        due,
        order.payment_days_between_installments
      );
    }
    const amt = amounts[i] ?? 0;
    rows.push({
      tenant_id: tenantId,
      sales_order_id: order.id,
      document_number: `${order.order_number}-${i + 1}/${n}`,
      description: `Parcela ${i + 1}/${n} — pedido ${order.order_number}`,
      original_amount: amt,
      current_amount: amt,
      issue_date: baseDate,
      due_date: due,
      status: "pending" as const,
      client_name: order.client_name,
      client_document: order.client_document,
    });
  }

  const { error } = await admin.from("receivables").insert(rows);
  if (error) return { error: error.message };
  return {};
}

/**
 * A criação automática de OP única no pedido foi descontinuada.
 * Use o MRP por linha (`processMrpForSalesOrder` / API MRP).
 */
export async function ensureProductionOrderForSales(
  _admin: AdminClient,
  _ctx: { tenantId: string; userId: string },
  _salesOrder: {
    id: string;
    order_number: string;
    client_name: string;
    client_document: string | null;
    expected_delivery: string | null;
  }
): Promise<{ productionOrderId: string | null; error?: string }> {
  return { productionOrderId: null };
}

/**
 * Rollback best-effort: recebíveis, PCs em rascunho ligados às OPs deste pedido,
 * OPs (cabeçalho e por linha de venda) e o pedido de venda.
 */
export async function rollbackSalesOrderCreation(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<void> {
  await admin
    .from("receivables")
    .delete()
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);

  const { data: so } = await admin
    .from("sales_orders")
    .select("production_order_id")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: lineRows } = await admin
    .from("sales_order_items")
    .select("production_order_id")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);

  const productionIds = new Set<string>();
  if (so?.production_order_id) productionIds.add(so.production_order_id);
  for (const row of lineRows ?? []) {
    if (row.production_order_id) productionIds.add(row.production_order_id);
  }

  for (const prdId of productionIds) {
    const { data: poiRows } = await admin
      .from("purchase_order_items")
      .select("purchase_order_id")
      .eq("tenant_id", tenantId)
      .eq("production_order_id", prdId);

    const purchaseOrderIds = [
      ...new Set(
        (poiRows ?? [])
          .map((r) => r.purchase_order_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    for (const poid of purchaseOrderIds) {
      const { data: poHdr } = await admin
        .from("purchase_orders")
        .select("id, status")
        .eq("id", poid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (poHdr?.status === "draft") {
        await admin
          .from("purchase_orders")
          .delete()
          .eq("id", poid)
          .eq("tenant_id", tenantId);
      }
    }

    await admin
      .from("production_orders")
      .delete()
      .eq("id", prdId)
      .eq("tenant_id", tenantId);
  }

  await admin
    .from("sales_orders")
    .delete()
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);
}
