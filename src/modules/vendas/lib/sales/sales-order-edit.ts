import type { AdminClient, SaleLineInput } from "@/modules/vendas/lib/sales/sales-flow";
import { recalculateSalesOrderHeaderTotals } from "@/modules/vendas/lib/sales/sales-order-totals";
import {
  lineNetSubtotal,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { fetchCustomerForTenant } from "@/modules/vendas/lib/sales/quote-customer";
import {
  SALES_ORDER_ADMIN_FIELDS_WHEN_PRODUCTION,
  getRestrictedFieldsWhenProductionStarted,
} from "@/modules/vendas/lib/sales/sales-order-change-log";
import type { SalesOrderUpdate } from "@/modules/core/types/sales.types";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";
import { syncSalesOrderReadyForInvoice } from "@/modules/vendas/lib/sales/sales-order-ready-for-invoice";
import { reserveFinishedGoodsForSalesOrder } from "@/modules/almoxarifado/lib/inventory-reservations";

export type SalesOrderEditGuard = {
  mrp_processed: boolean;
  production_order_id: string | null;
  production_started: boolean;
  warehouse_supplied: boolean;
  /** NF-e em curso/autorizada, nota agrupada ou fecho de faturamento. */
  has_invoice: boolean;
  /** Troca de produto, preço, inclusão e remoção de linhas. */
  can_edit_items: boolean;
  /** Quantidade das linhas já existentes, enquanto não houver faturamento. */
  can_edit_quantities: boolean;
  /** Cliente, prazo, e-mail, etc. */
  can_edit_commercial: boolean;
  /** Observações e condições de pagamento (com produção iniciada). */
  can_edit_admin_only: boolean;
};

/** Verifica se o almoxarifado já liberou material para fabricação. */
export async function salesOrderWarehouseSupplied(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<boolean> {
  const { data: soiRows, error: soiErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (soiErr) throw new Error(soiErr.message);

  const soiIds = (soiRows ?? []).map((r) => r.id);
  if (!soiIds.length) return false;

  const { count, error: oiErr } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("sales_order_item_id", soiIds)
    .not("warehouse_supplied_at", "is", null);

  if (oiErr) throw new Error(oiErr.message);
  return (count ?? 0) > 0;
}

/** Verifica se algum item de produção já tem data de início. */
export async function salesOrderProductionStarted(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  _productionOrderId?: string | null
): Promise<boolean> {
  const { data: soiRows, error: soiErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (soiErr) throw new Error(soiErr.message);

  const soiIds = (soiRows ?? []).map((r) => r.id);
  if (!soiIds.length) return false;

  const { count, error: oiErr } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("sales_order_item_id", soiIds)
    .or(
      "production_start.not.is.null,apontamento_start_at.not.is.null,apontamento_end_at.not.is.null,completed_at.not.is.null,status.eq.completed"
    );

  if (oiErr) throw new Error(oiErr.message);
  return (count ?? 0) > 0;
}

const BLOCKING_NFE_STATUSES = ["pending", "processing", "authorized"] as const;

/** Pedido com nota em curso/autorizada ou já fechado no faturamento. */
export async function salesOrderHasBlockingInvoice(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<boolean> {
  const db = asUntypedAdmin(admin);
  const { data: so, error: soErr } = await db
    .from("sales_orders")
    .select("billing_closure")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  const closure =
    so && typeof so === "object"
      ? (so as { billing_closure?: string | null }).billing_closure
      : null;
  if (closure) return true;

  const { data: nfes, error: nfeErr } = await admin
    .from("nfes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .in("status", [...BLOCKING_NFE_STATUSES])
    .limit(1);
  if (nfeErr) throw new Error(nfeErr.message);
  if (nfes?.length) return true;

  const { data: member, error: memberErr } = await db
    .from("nfe_invoice_group_members")
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .maybeSingle();
  if (memberErr) throw new Error(memberErr.message);
  const groupId =
    member && typeof member === "object"
      ? String((member as { group_id?: string }).group_id ?? "")
      : "";
  if (!groupId) return false;

  const { data: group, error: groupErr } = await db
    .from("nfe_invoice_groups")
    .select("nfe_id")
    .eq("id", groupId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (groupErr) throw new Error(groupErr.message);
  const nfeId =
    group && typeof group === "object"
      ? (group as { nfe_id?: string | null }).nfe_id
      : null;
  if (!nfeId) return false;

  const { data: groupNfe, error: groupNfeErr } = await admin
    .from("nfes")
    .select("status")
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (groupNfeErr) throw new Error(groupNfeErr.message);
  const status = groupNfe?.status;
  return (
    status === "pending" || status === "processing" || status === "authorized"
  );
}

export async function getSalesOrderEditGuard(
  admin: AdminClient,
  tenantId: string,
  order: {
    id: string;
    mrp_processed: boolean;
    production_order_id: string | null;
    status?: string | null;
  }
): Promise<SalesOrderEditGuard> {
  const [production_started, warehouse_supplied, has_invoice] =
    await Promise.all([
      salesOrderProductionStarted(
        admin,
        tenantId,
        order.id,
        order.production_order_id
      ),
      salesOrderWarehouseSupplied(admin, tenantId, order.id),
      salesOrderHasBlockingInvoice(admin, tenantId, order.id),
    ]);
  const closed =
    order.status === "cancelled" || order.status === "superseded";
  const structureLocked =
    order.mrp_processed === true || production_started || has_invoice || closed;
  return {
    mrp_processed: order.mrp_processed === true,
    production_order_id: order.production_order_id,
    production_started,
    warehouse_supplied,
    has_invoice,
    can_edit_items: !structureLocked,
    can_edit_quantities: !has_invoice && !closed,
    can_edit_commercial: !production_started && !closed,
    can_edit_admin_only: production_started && !closed,
  };
}

export function assertUpdateAllowedWhenProductionStarted(
  updateData: SalesOrderUpdate,
  options: { itemsReplaced: boolean; customerResolved: boolean },
  productionStarted: boolean
): { ok: true } | { ok: false; message: string } {
  if (!productionStarted) return { ok: true };

  const blocked = getRestrictedFieldsWhenProductionStarted(updateData, options);
  if (!blocked.length) return { ok: true };

  const labels = blocked
    .map((f) => {
      if (f === "items") return "itens";
      if (f.startsWith("client_")) return "dados do cliente";
      return f;
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    ok: false,
    message: `Produção já iniciada. Não é possível alterar: ${labels.join(", ")}. Observações, parcelas e prazo PCP podem ser editados.`,
  };
}

/** Campos do body que exigem permissão de vendas/admin. */
export function bodyWantsSalesOrderContentEdit(
  b: Record<string, unknown>
): boolean {
  const salesKeys = [
    "customer_id",
    "client_name",
    "client_document",
    "client_email",
    "client_phone",
    "client_address",
    "delivery_address_different",
    "delivery_street",
    "delivery_number",
    "delivery_complement",
    "delivery_neighborhood",
    "delivery_city",
    "delivery_state",
    "delivery_zip",
    "expected_delivery",
    "notes",
    "payment_installments",
    "payment_days_to_first_due",
    "payment_days_between_installments",
    "payment_due_mode",
    "payment_fixed_due_dates",
    "payment_installment_amounts",
    "items",
    "order_date",
    "order_number",
    "discount",
    "tax",
    "subtotal",
    "total",
    "quote_id",
  ];
  return salesKeys.some((k) => b[k] !== undefined);
}

export function isAdminOnlyFieldWhenProduction(field: string): boolean {
  return SALES_ORDER_ADMIN_FIELDS_WHEN_PRODUCTION.has(field);
}

/** Substitui todos os itens do pedido (apenas antes do MRP e sem produção iniciada). */
export async function replaceSalesOrderItemsFromLines(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  lines: SaleLineInput[]
): Promise<{ error?: string }> {
  if (!lines.length) {
    return { error: "O pedido deve ter pelo menos um item." };
  }

  const { data: oldSois, error: oldErr } = await admin
    .from("sales_order_items")
    .select("id, line_number, product_id")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId)
    .order("line_number", { ascending: true });
  if (oldErr) return { error: oldErr.message };

  const oldSoiIds = (oldSois ?? []).map((r) => r.id);
  type LinkedChild = { id: string; sales_order_item_id: string | null };
  let orphanOrderItems: LinkedChild[] = [];
  let orphanPurchaseItems: LinkedChild[] = [];

  if (oldSoiIds.length) {
    const [{ data: oiRows }, { data: poiRows }] = await Promise.all([
      admin
        .from("order_items")
        .select("id, sales_order_item_id")
        .eq("tenant_id", tenantId)
        .in("sales_order_item_id", oldSoiIds),
      admin
        .from("purchase_order_items")
        .select("id, sales_order_item_id")
        .eq("tenant_id", tenantId)
        .in("sales_order_item_id", oldSoiIds),
    ]);
    orphanOrderItems = (oiRows ?? []) as LinkedChild[];
    orphanPurchaseItems = (poiRows ?? []) as LinkedChild[];
  }

  const oldByLine = new Map<number, string>();
  const oldByProduct = new Map<string, string[]>();
  for (const row of oldSois ?? []) {
    oldByLine.set(Number(row.line_number), row.id);
    if (row.product_id) {
      const list = oldByProduct.get(row.product_id) ?? [];
      list.push(row.id);
      oldByProduct.set(row.product_id, list);
    }
  }

  const { error: delErr } = await admin
    .from("sales_order_items")
    .delete()
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (delErr) return { error: delErr.message };

  const productIds = lines
    .map((l) => l.product_id)
    .filter((id): id is string => Boolean(id));

  const costs = new Map<string, number>();
  if (productIds.length) {
    const { data: prods, error: pErr } = await admin
      .from("products")
      .select("id, cost_price")
      .eq("tenant_id", tenantId)
      .in("id", productIds);
    if (pErr) return { error: pErr.message };
    for (const p of prods ?? []) {
      costs.set(p.id, Number(p.cost_price ?? 0));
    }
  }

  const rows = lines.map((it, idx) => {
    const pid = it.product_id;
    const uc = pid != null ? (costs.get(pid) ?? null) : null;
    const discount = roundMoney(Math.max(0, Number(it.discount ?? 0)));
    const sub = lineNetSubtotal(it.quantity, it.unit_price, discount);
    const ipiVal = roundMoney(it.ipi_value ?? 0);
    const taxBase = roundMoney(it.tax_base ?? sub + ipiVal);
    const totalPrice = sub;

    return {
      tenant_id: tenantId,
      sales_order_id: salesOrderId,
      line_number: idx + 1,
      product_id: it.product_id,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit ?? "UN",
      unit_price: it.unit_price,
      discount,
      unit_cost: uc,
      total_price: totalPrice,
      icms_rate: it.icms_rate ?? 0,
      icms_value: it.icms_value ?? 0,
      ipi_rate: it.ipi_rate ?? 0,
      ipi_value: ipiVal,
      tax_base: taxBase,
      usage_type: it.usage_type ?? null,
      item_notes: it.item_notes?.trim() ? it.item_notes.trim() : null,
    };
  });

  const { data: inserted, error } = await admin
    .from("sales_order_items")
    .insert(rows)
    .select("id, line_number, product_id");
  if (error) return { error: error.message };

  /** Mapa old SOI id → new SOI id (por linha, senão por produto). */
  const oldToNew = new Map<string, string>();
  const usedOld = new Set<string>();
  for (const neu of inserted ?? []) {
    const line = Number(neu.line_number);
    const byLine = oldByLine.get(line);
    if (byLine && !usedOld.has(byLine)) {
      oldToNew.set(byLine, neu.id);
      usedOld.add(byLine);
      continue;
    }
    const pid = neu.product_id;
    if (!pid) continue;
    const candidates = oldByProduct.get(pid) ?? [];
    const free = candidates.find((id) => !usedOld.has(id));
    if (free) {
      oldToNew.set(free, neu.id);
      usedOld.add(free);
    }
  }

  if (oldToNew.size) {
    for (const child of orphanOrderItems) {
      const oldId = child.sales_order_item_id;
      if (!oldId) continue;
      const neu = oldToNew.get(oldId);
      if (!neu) continue;
      const { error: linkErr } = await admin
        .from("order_items")
        .update({ sales_order_item_id: neu })
        .eq("id", child.id)
        .eq("tenant_id", tenantId);
      if (linkErr) return { error: linkErr.message };
    }
    for (const child of orphanPurchaseItems) {
      const oldId = child.sales_order_item_id;
      if (!oldId) continue;
      const neu = oldToNew.get(oldId);
      if (!neu) continue;
      const { error: linkErr } = await admin
        .from("purchase_order_items")
        .update({ sales_order_item_id: neu })
        .eq("id", child.id)
        .eq("tenant_id", tenantId);
      if (linkErr) return { error: linkErr.message };
    }
  }

  const totals = await recalculateSalesOrderHeaderTotals(
    admin,
    tenantId,
    salesOrderId
  );
  if (totals.error) return { error: totals.error };
  return {};
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.001;
}

function sameQty(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.0001;
}

/**
 * Altera quantidade, preço e desconto de linhas existentes.
 * Usado quando o pedido já foi ao planeamento ou a produção começou,
 * mas ainda não foi faturado.
 */
export async function applySalesOrderItemQuantities(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  lines: SaleLineInput[],
  options?: { userId?: string | null; orderStatus?: string | null }
): Promise<{ error?: string; changed: boolean }> {
  const { data: existingRows, error: loadErr } = await admin
    .from("sales_order_items")
    .select(
      "id, product_id, description, quantity, unit_price, discount, unit"
    )
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (loadErr) return { error: loadErr.message, changed: false };

  const existing = existingRows ?? [];
  const lockedMsg =
    "Depois do planeamento ou do início da produção, produto e inclusão ou remoção de itens ficam bloqueados. Quantidade, preço e desconto podem ser alterados enquanto o pedido não for faturado.";

  if (lines.length !== existing.length) {
    return { error: lockedMsg, changed: false };
  }

  const byId = new Map(existing.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const changes: Array<{
    id: string;
    productId: string | null;
    description: string;
    oldQty: number;
    newQty: number;
    qtyChanged: boolean;
    unitPrice: number;
    discount: number;
    icmsValue: number;
    ipiValue: number;
    taxBase: number;
  }> = [];

  for (const line of lines) {
    const id = line.id?.trim();
    if (!id || seen.has(id) || !byId.has(id)) {
      return { error: lockedMsg, changed: false };
    }
    seen.add(id);
    const prev = byId.get(id)!;
    const prevProduct = prev.product_id ?? null;
    const nextProduct = line.product_id ?? null;
    if (prevProduct !== nextProduct) {
      return {
        error: `O item "${prev.description}" não pode trocar de produto. Altere a quantidade, o preço ou o desconto.`,
        changed: false,
      };
    }

    const oldQty = Number(prev.quantity);
    const newQty = Number(line.quantity);
    const qtyChanged = !sameQty(oldQty, newQty);
    const priceChanged = !sameMoney(Number(prev.unit_price), line.unit_price);
    const discountChanged = !sameMoney(
      Number(prev.discount ?? 0),
      Number(line.discount ?? 0)
    );
    if (!qtyChanged && !priceChanged && !discountChanged) continue;

    const discount = roundMoney(Math.max(0, Number(line.discount ?? 0)));
    const net = lineNetSubtotal(newQty, line.unit_price, discount);
    const ipiValue = roundMoney(line.ipi_value ?? 0);
    changes.push({
      id,
      productId: prevProduct,
      description: prev.description,
      oldQty,
      newQty,
      qtyChanged,
      unitPrice: line.unit_price,
      discount,
      icmsValue: roundMoney(line.icms_value ?? 0),
      ipiValue,
      taxBase: roundMoney(line.tax_base ?? net + ipiValue),
    });
  }

  if (!changes.length) return { changed: false };

  const qtyChanges = changes.filter((c) => c.qtyChanged);
  const soiIds = qtyChanges.map((c) => c.id);
  let oiRows: Array<{
    id: string;
    order_id: string;
    sales_order_item_id: string | null;
    quantity: number;
    status: string;
    is_suggestion: boolean;
    completed_at: string | null;
    apontamento_start_at: string | null;
    apontamento_end_at: string | null;
    production_start: string | null;
    production_end: string | null;
  }> = [];
  if (soiIds.length) {
    const { data, error: oiErr } = await admin
      .from("order_items")
      .select(
        "id, order_id, sales_order_item_id, quantity, status, is_suggestion, completed_at, apontamento_start_at, apontamento_end_at, production_start, production_end"
      )
      .eq("tenant_id", tenantId)
      .in("sales_order_item_id", soiIds);
    if (oiErr) return { error: oiErr.message, changed: false };
    oiRows = data ?? [];
  }

  const oiBySoi = new Map<string, typeof oiRows>();
  for (const oi of oiRows ?? []) {
    const key = oi.sales_order_item_id;
    if (!key) continue;
    const list = oiBySoi.get(key) ?? [];
    list.push(oi);
    oiBySoi.set(key, list);
  }

  const reopenedOrderIds = new Set<string>();
  const targetsByChange = new Map<string, NonNullable<typeof oiRows>>();

  for (const change of qtyChanges) {
    const linked = oiBySoi.get(change.id) ?? [];
    const real = linked.filter((row) => row.is_suggestion !== true);
    const matched = real.filter((row) =>
      sameQty(Number(row.quantity), change.oldQty)
    );
    const targets = matched.length ? matched : real.slice(0, 1);
    const decreasing = change.newQty + 1e-9 < change.oldQty;
    if (
      decreasing &&
      targets.some((row) => isOrderItemProductionFinished(row))
    ) {
      return {
        error: `A linha "${change.description}" já foi finalizada na produção. Enquanto o pedido não for faturado, só é possível aumentar a quantidade.`,
        changed: false,
      };
    }
    targetsByChange.set(change.id, targets);
  }

  for (const change of changes) {
    const linked = oiBySoi.get(change.id) ?? [];
    const targets = targetsByChange.get(change.id) ?? [];

    const { error: updErr } = await admin
      .from("sales_order_items")
      .update({
        quantity: change.newQty,
        unit_price: change.unitPrice,
        discount: change.discount,
        total_price: lineNetSubtotal(
          change.newQty,
          change.unitPrice,
          change.discount
        ),
        icms_value: change.icmsValue,
        ipi_value: change.ipiValue,
        tax_base: change.taxBase,
      })
      .eq("id", change.id)
      .eq("tenant_id", tenantId);
    if (updErr) return { error: updErr.message, changed: false };

    if (!change.qtyChanged) continue;

    for (const row of targets) {
      const finished = isOrderItemProductionFinished(row);
      const increasing = change.newQty > change.oldQty + 1e-9;
      const patch: {
        quantity: number;
        status?: string;
        completed_at?: null;
        completed_by?: null;
        apontamento_end_at?: null;
        production_end?: null;
      } = { quantity: change.newQty };
      if (increasing && finished) {
        patch.status = row.apontamento_start_at || row.production_start
          ? "in_progress"
          : "waiting";
        patch.completed_at = null;
        patch.completed_by = null;
        patch.apontamento_end_at = null;
        patch.production_end = null;
        reopenedOrderIds.add(row.order_id);
      }
      const { error: oiUpdErr } = await admin
        .from("order_items")
        .update(patch)
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (oiUpdErr) return { error: oiUpdErr.message, changed: false };
    }

    for (const row of linked) {
      if (row.is_suggestion !== true) continue;
      const { error: sugErr } = await admin
        .from("order_items")
        .update({ quantity: change.newQty })
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (sugErr) return { error: sugErr.message, changed: false };
    }

    if (change.productId) {
      const { error: pickErr } = await admin
        .from("picking_suggestions")
        .update({ quantity: change.newQty })
        .eq("tenant_id", tenantId)
        .eq("sales_order_id", salesOrderId)
        .eq("product_id", change.productId)
        .eq("status", "pending");
      if (pickErr) return { error: pickErr.message, changed: false };
    }
  }

  if (reopenedOrderIds.size) {
    const { error: opErr } = await admin
      .from("production_orders")
      .update({ status: "in_production", finished_at: null })
      .eq("tenant_id", tenantId)
      .in("id", [...reopenedOrderIds])
      .in("status", ["finished", "ready"]);
    if (opErr) return { error: opErr.message, changed: false };
  }

  const totals = await recalculateSalesOrderHeaderTotals(
    admin,
    tenantId,
    salesOrderId
  );
  if (totals.error) return { error: totals.error, changed: false };

  try {
    await syncSalesOrderReadyForInvoice(admin, tenantId, salesOrderId);
  } catch (syncErr) {
    return {
      error:
        syncErr instanceof Error
          ? syncErr.message
          : "Erro ao actualizar a liberação para faturamento.",
      changed: false,
    };
  }

  const status = options?.orderStatus ?? "";
  if (status === "confirmed" || status === "in_production") {
    try {
      await reserveFinishedGoodsForSalesOrder(
        admin,
        tenantId,
        salesOrderId,
        options?.userId
      );
    } catch (resErr) {
      return {
        error:
          resErr instanceof Error
            ? resErr.message
            : "Erro ao actualizar o empenho de estoque.",
        changed: false,
      };
    }
  }

  return { changed: true };
}

export async function resolveCustomerForSalesOrderUpdate(
  admin: AdminClient,
  tenantId: string,
  customerId: string
): Promise<
  | {
      ok: true;
      client_name: string;
      client_document: string | null;
      client_email: string | null;
      client_phone: string | null;
      client_address: string | null;
    }
  | { ok: false; message: string }
> {
  const cust = await fetchCustomerForTenant(admin, tenantId, customerId);
  if (!cust) {
    return { ok: false, message: "Cliente inválido ou inactivo." };
  }
  return {
    ok: true,
    client_name: cust.name,
    client_document: cust.document,
    client_email: cust.email,
    client_phone: cust.phone,
    client_address: cust.address,
  };
}
