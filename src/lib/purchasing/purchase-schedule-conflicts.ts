import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

export type PurchaseProductionConflict = {
  sales_order_item_id: string;
  order_item_id: string | null;
  order_number: string | null;
  product_name: string | null;
  component_description: string | null;
  purchase_order_item_id: string;
  expected_delivery_date: string;
  production_end: string | null;
  pcp_deadline: string | null;
  suggested_production_end: string;
  message: string;
};

function dateOnly(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  return String(v).slice(0, 10);
}

export function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

/** need_date = pcp_deadline − lead_time (mínimo hoje). */
export function computePurchaseNeedDate(
  pcpDeadline: string | null,
  leadTimeDays: number | null | undefined
): string | null {
  const pcp = dateOnly(pcpDeadline);
  if (!pcp) return null;
  const lead = Math.max(0, Number(leadTimeDays ?? 0));
  const need = subtractDays(pcp, lead);
  const today = new Date().toISOString().slice(0, 10);
  return need < today ? today : need;
}

function effectiveItemDeliveryDate(row: {
  expected_delivery_date: string | null;
  follow_up_date: string | null;
  actual_delivery_date?: string | null;
  purchase_order?: { expected_delivery: string | null; status: string | null } | null;
}): string | null {
  const po = Array.isArray(row.purchase_order)
    ? row.purchase_order[0]
    : row.purchase_order;
  return (
    dateOnly(row.actual_delivery_date) ??
    dateOnly(row.expected_delivery_date) ??
    dateOnly(row.follow_up_date) ??
    (po ? dateOnly(po.expected_delivery) : null)
  );
}

type PoiRow = {
  id: string;
  description: string | null;
  expected_delivery_date: string | null;
  follow_up_date: string | null;
  actual_delivery_date: string | null;
  sales_order_item_id: string | null;
  purchase_order_id: string | null;
  purchase_order?: { expected_delivery: string | null; status: string | null } | null;
};

/** Maior data prevista de entrega de componentes para uma linha de venda. */
export async function getMaxPurchaseDeliveryForSalesOrderItem(
  admin: Admin,
  tenantId: string,
  salesOrderItemId: string
): Promise<{ maxDate: string | null; items: Array<{ id: string; date: string; description: string }> }> {
  const { data, error } = await admin
    .from("purchase_order_items")
    .select(
      `id, description, expected_delivery_date, follow_up_date, actual_delivery_date,
       sales_order_item_id, purchase_order_id,
       purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(expected_delivery, status)`
    )
    .eq("tenant_id", tenantId)
    .eq("sales_order_item_id", salesOrderItemId);

  if (error) throw new Error(error.message);

  let maxDate: string | null = null;
  const items: Array<{ id: string; date: string; description: string }> = [];

  for (const row of (data ?? []) as PoiRow[]) {
    const po = Array.isArray(row.purchase_order)
      ? row.purchase_order[0]
      : row.purchase_order;
    if (po?.status === "cancelled") continue;

    const d =
      dateOnly(row.actual_delivery_date) ??
      effectiveItemDeliveryDate(row);
    if (!d) continue;
    items.push({
      id: row.id,
      date: d,
      description: row.description?.trim() || "Componente",
    });
    if (!maxDate || d > maxDate) maxDate = d;
  }

  return { maxDate, items };
}

export async function checkPurchaseDeliveryVsProduction(
  admin: Admin,
  tenantId: string,
  purchaseOrderItemId: string,
  newExpectedDelivery: string
): Promise<PurchaseProductionConflict | null> {
  const delivery = dateOnly(newExpectedDelivery);
  if (!delivery) return null;

  const { data: poi, error: poiErr } = await admin
    .from("purchase_order_items")
    .select("id, description, sales_order_item_id")
    .eq("id", purchaseOrderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (poiErr) throw new Error(poiErr.message);
  if (!poi?.sales_order_item_id) return null;

  const salesOrderItemId = poi.sales_order_item_id;

  const { data: oi } = await admin
    .from("order_items")
    .select(
      `id, production_end, pcp_deadline,
       sales_order_item:sales_order_items!order_items_sales_order_item_id_fkey(
         id,
         sales_order:sales_orders!sales_order_items_sales_order_id_fkey(order_number, pcp_deadline)
       )`
    )
    .eq("tenant_id", tenantId)
    .eq("sales_order_item_id", salesOrderItemId)
    .maybeSingle();

  const soi = Array.isArray(oi?.sales_order_item)
    ? oi.sales_order_item[0]
    : oi?.sales_order_item;
  const so = soi?.sales_order
    ? Array.isArray(soi.sales_order)
      ? soi.sales_order[0]
      : soi.sales_order
    : null;

  const prodEnd = dateOnly(oi?.production_end);
  const pcp =
    dateOnly(oi?.pcp_deadline) ??
    dateOnly(soi?.pcp_deadline) ??
    dateOnly(so?.pcp_deadline);

  const suggested = addDays(delivery, 1);

  if (prodEnd && prodEnd < delivery) {
    return {
      sales_order_item_id: salesOrderItemId,
      order_item_id: oi?.id ?? null,
      order_number: so?.order_number ?? null,
      product_name: null,
      component_description: poi.description,
      purchase_order_item_id: purchaseOrderItemId,
      expected_delivery_date: delivery,
      production_end: prodEnd,
      pcp_deadline: pcp,
      suggested_production_end: suggested,
      message: `A produção termina em ${prodEnd}, mas o componente só chega em ${delivery}.`,
    };
  }

  if (pcp && delivery > pcp) {
    return {
      sales_order_item_id: salesOrderItemId,
      order_item_id: oi?.id ?? null,
      order_number: so?.order_number ?? null,
      product_name: null,
      component_description: poi.description,
      purchase_order_item_id: purchaseOrderItemId,
      expected_delivery_date: delivery,
      production_end: prodEnd,
      pcp_deadline: pcp,
      suggested_production_end: suggested,
      message: `A entrega do componente (${delivery}) é posterior ao prazo PCP (${pcp}).`,
    };
  }

  return null;
}

export async function checkProductionDateVsPurchases(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  field: "production_start" | "production_end",
  newValue: string | null
): Promise<{
  conflict: boolean;
  max_purchase_delivery: string | null;
  blocking_component: string | null;
  suggested_end: string | null;
  message: string | null;
}> {
  const empty = {
    conflict: false,
    max_purchase_delivery: null,
    blocking_component: null,
    suggested_end: null,
    message: null,
  };
  const candidate = dateOnly(newValue);
  if (!candidate) return empty;

  const { data: oi, error } = await admin
    .from("order_items")
    .select("id, sales_order_item_id, production_start, production_end")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!oi?.sales_order_item_id) return empty;

  const { maxDate, items } = await getMaxPurchaseDeliveryForSalesOrderItem(
    admin,
    tenantId,
    oi.sales_order_item_id
  );

  if (!maxDate) return empty;

  const compareDate =
    field === "production_end"
      ? candidate
      : dateOnly(oi.production_end) ?? candidate;

  if (compareDate >= maxDate) return empty;

  const blocker = items.find((i) => i.date === maxDate) ?? items[0];
  const suggested = addDays(maxDate, 1);

  return {
    conflict: true,
    max_purchase_delivery: maxDate,
    blocking_component: blocker?.description ?? null,
    suggested_end: suggested,
    message: `A data de ${field === "production_start" ? "início" : "término"} (${compareDate}) é anterior à entrega do componente «${blocker?.description ?? "—"}» prevista para ${maxDate}.`,
  };
}

/** Conflito ao alterar prazo do pedido (cabeçalho) vs produção dos itens ligados. */
export async function checkPurchaseOrderExpectedDeliveryVsProduction(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string,
  newExpectedDelivery: string
): Promise<PurchaseProductionConflict | null> {
  const delivery = dateOnly(newExpectedDelivery);
  if (!delivery) return null;

  const { data: items, error } = await admin
    .from("purchase_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", purchaseOrderId)
    .not("sales_order_item_id", "is", null);

  if (error) throw new Error(error.message);

  let worst: PurchaseProductionConflict | null = null;
  for (const item of items ?? []) {
    const c = await checkPurchaseDeliveryVsProduction(
      admin,
      tenantId,
      item.id,
      delivery
    );
    if (!c) continue;
    if (
      !worst ||
      (c.expected_delivery_date > worst.expected_delivery_date)
    ) {
      worst = c;
    }
  }
  return worst;
}
