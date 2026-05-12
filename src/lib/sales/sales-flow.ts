import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type AdminClient = SupabaseClient<Database>;

/** Linhas de produto em orçamento / pedido (payload da API). */
export type SaleLineInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
};

export function addDaysToISODate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

    lines.push({
      description,
      quantity,
      unit_price,
      unit,
      product_id,
    });
  }

  return { ok: true, lines };
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

  const costs = await fetchProductCosts(admin, tenantId, lines);

  const rows = lines.map((it) => {
    const pid = it.product_id;
    const uc = pid != null ? (costs.get(pid) ?? null) : null;
    return {
      tenant_id: tenantId,
      sales_order_id: salesOrderId,
      product_id: it.product_id,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit ?? "UN",
      unit_price: it.unit_price,
      unit_cost: uc,
    };
  });

  const { error } = await admin.from("sales_order_items").insert(rows);
  if (error) return { error: error.message };
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
  }));
  const { error } = await admin.from("quote_items").insert(rows);
  if (error) return { error: error.message };
  return {};
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

type FinishedLine = {
  description: string;
  quantity: number;
  product_id: string;
  productName: string;
};

/** Cria pedido de produção e itens para linhas cujo produto é `finished`. */
export async function ensureProductionOrderForSales(
  admin: AdminClient,
  ctx: { tenantId: string; userId: string },
  salesOrder: {
    id: string;
    order_number: string;
    client_name: string;
    client_document: string | null;
    expected_delivery: string | null;
  }
): Promise<{ productionOrderId: string | null; error?: string }> {
  const { data: lines, error: lErr } = await admin
    .from("sales_order_items")
    .select(
      "description, quantity, product_id, product:products!sales_order_items_product_id_fkey(type, name)"
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("sales_order_id", salesOrder.id);

  if (lErr) return { productionOrderId: null, error: lErr.message };

  const { data: headerRow } = await admin
    .from("sales_orders")
    .select("production_order_id")
    .eq("id", salesOrder.id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (headerRow?.production_order_id) {
    return { productionOrderId: headerRow.production_order_id };
  }

  const finished: FinishedLine[] = [];

  for (const row of lines ?? []) {
    const pid = row.product_id;
    if (!pid) continue;
    const prod = row.product as
      | { type: string; name: string }
      | { type: string; name: string }[]
      | null;
    const p = Array.isArray(prod) ? prod[0] : prod;
    if (!p || p.type !== "finished") continue;
    finished.push({
      product_id: pid,
      description: row.description,
      quantity: row.quantity,
      productName: p.name,
    });
  }

  if (finished.length === 0) {
    return { productionOrderId: null };
  }

  const suffix = salesOrder.id.replace(/-/g, "").slice(0, 8);
  const orderNumber = `PRD-${salesOrder.order_number}-${suffix}`;

  const descLines = finished
    .map((f) => `${f.productName} × ${f.quantity}`)
    .join("; ")
    .slice(0, 2000);

  const { data: po, error: poErr } = await admin
    .from("production_orders")
    .insert({
      tenant_id: ctx.tenantId,
      order_number: orderNumber,
      client_name: salesOrder.client_name,
      client_document: salesOrder.client_document,
      delivery_deadline: salesOrder.expected_delivery,
      description: `Venda ${salesOrder.order_number}: ${descLines}`,
      status: "imported",
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (poErr) {
    return { productionOrderId: null, error: poErr.message };
  }

  const itemRows = finished.map((f, idx) => ({
    tenant_id: ctx.tenantId,
    order_id: po.id,
    product_id: f.product_id,
    description: f.description,
    quantity: f.quantity,
    unit: "UN",
    item_number: idx + 1,
    status: "waiting" as const,
  }));

  const { error: oiErr } = await admin.from("order_items").insert(itemRows);
  if (oiErr) {
    await admin.from("production_orders").delete().eq("id", po.id);
    return { productionOrderId: null, error: oiErr.message };
  }

  const { error: linkErr } = await admin
    .from("sales_orders")
    .update({ production_order_id: po.id })
    .eq("id", salesOrder.id)
    .eq("tenant_id", ctx.tenantId);

  if (linkErr) {
    await admin.from("production_orders").delete().eq("id", po.id);
    return { productionOrderId: null, error: linkErr.message };
  }

  return { productionOrderId: po.id };
}

/** Remove pedido de venda recém-criado, títulos e OPC vinculado (best-effort rollback). */
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

  const prdId = so?.production_order_id;
  if (prdId) {
    await admin
      .from("sales_orders")
      .update({ production_order_id: null })
      .eq("id", salesOrderId)
      .eq("tenant_id", tenantId);
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
