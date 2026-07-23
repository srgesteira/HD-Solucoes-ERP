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

export type SalesOrderEditGuard = {
  mrp_processed: boolean;
  production_order_id: string | null;
  production_started: boolean;
  warehouse_supplied: boolean;
  can_edit_items: boolean;
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

export async function getSalesOrderEditGuard(
  admin: AdminClient,
  tenantId: string,
  order: {
    id: string;
    mrp_processed: boolean;
    production_order_id: string | null;
  }
): Promise<SalesOrderEditGuard> {
  const production_started = await salesOrderProductionStarted(
    admin,
    tenantId,
    order.id,
    order.production_order_id
  );
  const warehouse_supplied = await salesOrderWarehouseSupplied(
    admin,
    tenantId,
    order.id
  );
  return {
    mrp_processed: order.mrp_processed === true,
    production_order_id: order.production_order_id,
    production_started,
    warehouse_supplied,
    can_edit_items: !order.mrp_processed && !production_started,
    can_edit_commercial: !production_started,
    can_edit_admin_only: production_started,
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
    message: `Produção já iniciada. Não é possível alterar: ${labels.join(", ")}. Apenas observações e parcelas podem ser editadas.`,
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
    "expected_delivery",
    "notes",
    "payment_installments",
    "payment_days_to_first_due",
    "payment_days_between_installments",
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
