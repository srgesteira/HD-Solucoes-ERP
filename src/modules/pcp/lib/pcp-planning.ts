import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type { PcpItemOriginKind } from "@/modules/pcp/lib/pcp-item-origin";
import { resolvePcpItemOrigin } from "@/modules/pcp/lib/pcp-item-origin";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";
import { subtractDays } from "@/modules/compras/lib/purchasing/purchase-schedule-conflicts";

type Admin = SupabaseClient<Database>;

/** Pedidos de venda visíveis no planeamento PCP. */
export const PCP_SALES_ORDER_STATUSES = ["confirmed", "in_production"] as const;

export type PcpPlanningItem = {
  id: string;
  line_number: number;
  product_id: string | null;
  product_code: string | null;
  product_name: string;
  quantity: number;
  order_item_id: string | null;
  production_order_id: string | null;
  op_number: string | null;
  line_id: string | null;
  line_name: string | null;
  /** Prazo PCP definido só no item (sales_order_items.pcp_deadline). */
  item_pcp_deadline: string | null;
  /** Prazo PCP efetivo (item → order_item → pedido). */
  pcp_deadline: string | null;
  purchase_order_status: string | null;
  purchase_order_id: string | null;
  purchase_order_item_id: string | null;
  /** Previsão de entrega do PC (cabeçalho ou linha). */
  purchase_order_expected_delivery: string | null;
  /** Maior data prevista entre componentes comprados (linhas PO). */
  max_purchase_delivery_date: string | null;
  /** Farol de risco compras vs produção. */
  purchase_risk: "ok" | "warning" | "critical" | null;
  production_status: string | null;
  production_completed_at: string | null;
  production_start: string | null;
  production_end: string | null;
  apontamento_start_at: string | null;
  apontamento_end_at: string | null;
  quality_control: string | null;
  production_notes: string | null;
  can_start_production: boolean;
  /** Pedido de venda vs OP de estoque (Etapa A/B). */
  order_source: "sales" | "stock";
  product_type: string | null;
  product_nature: string | null;
  has_composition: boolean;
  /** BOM: existe componente com `parent_product_id` = produto. */
  has_bom: boolean;
  quantity_on_hand: number;
  /** Produzir | Comprar (informativo). */
  origin: string;
  origin_kind: PcpItemOriginKind;
  origin_label: string;
};

export type PcpPlanningOrder = {
  id: string;
  order_number: string;
  client_name: string;
  created_at: string;
  status: string;
  order_source: "sales" | "stock";
  ready_for_invoice: boolean;
  /** Prazo prometido ao cliente (`sales_orders.expected_delivery`). */
  expected_delivery: string | null;
  /** Alias legado — mesmo valor que `expected_delivery`. */
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  production_deadline: string | null;
  items: PcpPlanningItem[];
};

/** @deprecated Use PcpPlanningOrder */
export type PcpOrderPlanningRow = {
  sales_order_id: string;
  order_number: string;
  client_name: string;
  order_date: string;
  status: string;
  expected_delivery: string | null;
  pcp_deadline: string | null;
  lines: PcpLinePlanningRow[];
};

/** @deprecated Use PcpPlanningItem */
export type PcpLinePlanningRow = {
  sales_order_item_id: string;
  line_number: number;
  description: string;
  quantity: number;
  production_order_id: string | null;
  op_number: string | null;
  op_status: string | null;
  op_pcp_deadline: string | null;
  op_delivery_deadline: string | null;
  op_production_deadline: string | null;
  max_purchase_expected: string | null;
};

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  return String(v).slice(0, 10);
}

/** Fallback (orçamento) — só para farol quando `expected_delivery` do pedido estiver vazio. */
function salesOrderDeliveryDeadlineFallback(so: {
  quotes?: {
    expected_delivery_date: string | null;
    delivery_deadline: string | null;
  } | null;
}): string | null {
  const q = so.quotes;
  if (!q) return null;
  const fromDate = dateOnly(q.expected_delivery_date);
  if (fromDate) return fromDate;
  const dl = q.delivery_deadline?.trim();
  if (!dl) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dl)) return dl.slice(0, 10);
  const parsed = new Date(dl);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Prazo produção do pedido (PCP Control): maior `production_end` entre os itens;
 * se nenhum item tiver fim, usa valor legado armazenado no pedido (se existir).
 */
export function computeOrderProductionDeadline(
  items: Pick<PcpPlanningItem, "production_end">[],
  orderStoredProductionDeadline: string | null = null
): string | null {
  let maxEnd: string | null = null;
  for (const it of items) {
    const d = dateOnly(it.production_end);
    if (!d) continue;
    if (!maxEnd || d > maxEnd) maxEnd = d;
  }
  if (maxEnd) return maxEnd;
  return dateOnly(orderStoredProductionDeadline);
}

function pcReceived(
  poStatus: string | null,
  receivedQty: number,
  orderedQty: number
): boolean {
  if (poStatus === "received") return true;
  if (orderedQty <= 0) return false;
  return receivedQty >= orderedQty - 0.0001;
}

export async function fetchPcpPlanning(
  admin: Admin,
  tenantId: string
): Promise<PcpPlanningOrder[]> {
  const statuses = [...PCP_SALES_ORDER_STATUSES];
  const { data: orders, error } = await admin
    .from("sales_orders")
    .select(
      `
      id,
      order_number,
      client_name,
      created_at,
      status,
      ready_for_invoice,
      expected_delivery,
      pcp_deadline,
      quote_id,
      quotes!sales_orders_quote_id_fkey (
        expected_delivery_date,
        delivery_deadline
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("status", statuses)
    .order("expected_delivery", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const allProductIds = new Set<string>();
  const ordersList = orders ?? [];

  const { data: lines } = await admin
    .from("production_lines")
    .select("id, name, code")
    .eq("tenant_id", tenantId);
  const lineNameById = new Map(
    (lines ?? []).map((l) => [l.id, `${l.code} — ${l.name}`])
  );

  const orderIds = ordersList.map((o) => o.id);
  if (orderIds.length) {
    const { data: soiPidRows, error: pidErr } = await admin
      .from("sales_order_items")
      .select("product_id")
      .eq("tenant_id", tenantId)
      .in("sales_order_id", orderIds);
    if (pidErr) throw new Error(pidErr.message);
    for (const r of soiPidRows ?? []) {
      if (r.product_id) allProductIds.add(r.product_id);
    }
  }

  const inventoryByProduct = new Map<string, number>();
  const hasBomByProduct = new Set<string>();
  const productIdList = [...allProductIds];
  if (productIdList.length) {
    const { data: invRows, error: invErr } = await admin
      .from("inventory")
      .select("product_id, quantity_on_hand")
      .eq("tenant_id", tenantId)
      .in("product_id", productIdList);
    if (invErr) throw new Error(invErr.message);
    for (const inv of invRows ?? []) {
      inventoryByProduct.set(
        inv.product_id,
        Number(inv.quantity_on_hand ?? 0)
      );
    }

    const { data: bomParents, error: bomErr } = await admin
      .from("product_components")
      .select("parent_product_id")
      .eq("tenant_id", tenantId)
      .in("parent_product_id", productIdList);
    if (bomErr) throw new Error(bomErr.message);
    for (const row of bomParents ?? []) {
      if (row.parent_product_id) hasBomByProduct.add(row.parent_product_id);
    }
  }

  const result: PcpPlanningOrder[] = [];

  for (const so of ordersList) {
    const { data: items, error: iErr } = await admin
      .from("sales_order_items")
      .select(
        `
        id,
        line_number,
        description,
        quantity,
        product_id,
        production_order_id,
        pcp_deadline,
        product:products!sales_order_items_product_id_fkey(
          id,
          technical_code,
          name,
          type,
          product_nature,
          has_composition,
          default_production_line_id
        )
      `
      )
      .eq("tenant_id", tenantId)
      .eq("sales_order_id", so.id)
      .order("line_number", { ascending: true });

    if (iErr) throw new Error(iErr.message);

    const itemIds = (items ?? []).map((r) => r.id);

    const oiBySalesItem = new Map<
      string,
      {
        id: string;
        line_id: string | null;
        status: string | null;
        production_start: string | null;
        production_end: string | null;
        apontamento_start_at: string | null;
        apontamento_end_at: string | null;
        completed_at: string | null;
        quality_control: string | null;
        production_notes: string | null;
        pcp_deadline: string | null;
      }
    >();

    if (itemIds.length) {
      const { data: oiRows, error: oiErr } = await admin
        .from("order_items")
        .select(
          "id, sales_order_item_id, line_id, status, production_start, production_end, apontamento_start_at, apontamento_end_at, completed_at, quality_control, production_notes, pcp_deadline"
        )
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", false)
        .in("sales_order_item_id", itemIds);
      if (oiErr) throw new Error(oiErr.message);
      for (const oi of oiRows ?? []) {
        if (!oi.sales_order_item_id) continue;
        oiBySalesItem.set(oi.sales_order_item_id, {
          id: oi.id,
          line_id: oi.line_id,
          status: oi.status,
          production_start: oi.production_start,
          production_end: oi.production_end,
          apontamento_start_at: oi.apontamento_start_at ?? null,
          apontamento_end_at: oi.apontamento_end_at ?? null,
          completed_at: oi.completed_at ?? null,
          quality_control: oi.quality_control ?? null,
          production_notes: oi.production_notes ?? null,
          pcp_deadline: dateOnly(oi.pcp_deadline),
        });
      }
    }

    const poiBySalesItem = new Map<
      string,
      {
        id: string;
        purchase_order_id: string | null;
        quantity: number;
        received_quantity: number;
        status: string | null;
        expected_delivery: string | null;
        max_delivery: string | null;
      }
    >();

    if (itemIds.length) {
      const { data: poiRows, error: poiErr } = await admin
        .from("purchase_order_items")
        .select(
          "id, sales_order_item_id, purchase_order_id, quantity, received_quantity, expected_delivery_date, follow_up_date, actual_delivery_date, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(status, expected_delivery)"
        )
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", false)
        .in("sales_order_item_id", itemIds);
      if (poiErr) throw new Error(poiErr.message);

      for (const row of poiRows ?? []) {
        if (!row.sales_order_item_id) continue;
        const po = Array.isArray(row.purchase_order)
          ? row.purchase_order[0]
          : row.purchase_order;
        if (po?.status === "cancelled") continue;

        const lineDate =
          dateOnly(row.actual_delivery_date) ??
          dateOnly(row.expected_delivery_date) ??
          dateOnly(row.follow_up_date) ??
          (po ? dateOnly(po.expected_delivery) : null);

        const existing = poiBySalesItem.get(row.sales_order_item_id);
        const maxDelivery =
          !lineDate
            ? existing?.max_delivery ?? null
            : !existing?.max_delivery || lineDate > existing.max_delivery
              ? lineDate
              : existing.max_delivery;

        const useRowAsPrimary =
          !existing ||
          (!existing.purchase_order_id && row.purchase_order_id);

        poiBySalesItem.set(row.sales_order_item_id, {
          id: useRowAsPrimary ? row.id : existing!.id,
          purchase_order_id: useRowAsPrimary
            ? row.purchase_order_id
            : existing!.purchase_order_id,
          quantity: Number(row.quantity ?? 0),
          received_quantity: Number(row.received_quantity ?? 0),
          status:
            po?.status ??
            (row.purchase_order_id ? existing?.status ?? null : "draft"),
          expected_delivery: maxDelivery ?? existing?.expected_delivery ?? null,
          max_delivery: maxDelivery,
        });
      }
    }

    const opIds = [
      ...new Set(
        (items ?? [])
          .map((r) => r.production_order_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const opById = new Map<string, { order_number: string }>();
    if (opIds.length) {
      const { data: prRows, error: prErr } = await admin
        .from("production_orders")
        .select("id, order_number")
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", false)
        .in("id", opIds);
      if (prErr) throw new Error(prErr.message);
      for (const p of prRows ?? []) {
        opById.set(p.id, { order_number: p.order_number });
      }
    }

    const orderPcp = dateOnly(so.pcp_deadline);
    const itemRows: PcpPlanningItem[] = [];

    for (const row of items ?? []) {
      const prod = row.product as {
        technical_code?: string;
        name?: string;
        type?: string;
        product_nature?: string | null;
        has_composition?: boolean;
        default_production_line_id?: string | null;
      } | null;
      const oi = oiBySalesItem.get(row.id);
      const poi = poiBySalesItem.get(row.id);
      const lineId =
        oi?.line_id ??
        prod?.default_production_line_id ??
        null;
      const itemPcpRaw = dateOnly(row.pcp_deadline);
      const itemPcp =
        itemPcpRaw ?? oi?.pcp_deadline ?? orderPcp;

      const poStatus = poi?.status ?? null;
      const received = poi
        ? pcReceived(poStatus, poi.received_quantity, poi.quantity)
        : true;
      const hasPc = Boolean(poi);
      const canStart = !hasPc || received;

      const maxPurchaseDelivery = poi?.max_delivery ?? null;
      const prodEndDate = dateOnly(oi?.production_end);
      let purchaseRisk: "ok" | "warning" | "critical" | null = null;
      if (maxPurchaseDelivery) {
        if (prodEndDate && prodEndDate < maxPurchaseDelivery) {
          purchaseRisk = "critical";
        } else if (itemPcp && maxPurchaseDelivery > itemPcp) {
          purchaseRisk = "critical";
        } else if (
          itemPcp &&
          maxPurchaseDelivery >= subtractDays(itemPcp, 2)
        ) {
          purchaseRisk = "warning";
        } else {
          purchaseRisk = "ok";
        }
      }

      const opId = row.production_order_id;
      const op = opId ? opById.get(opId) : undefined;

      const qty = Number(row.quantity ?? 0);
      const onHand =
        row.product_id != null
          ? (inventoryByProduct.get(row.product_id) ?? 0)
          : 0;
      const productId = row.product_id;
      const hasBom =
        (productId != null && hasBomByProduct.has(productId)) ||
        prod?.has_composition === true;

      const origin = resolvePcpItemOrigin({
        product_type: prod?.type ?? null,
        product_nature: prod?.product_nature ?? null,
        has_bom: hasBom,
        has_composition: prod?.has_composition === true,
      });

      itemRows.push({
        id: row.id,
        line_number: row.line_number,
        product_id: row.product_id,
        product_code: prod?.technical_code ?? null,
        product_name: prod?.name ?? row.description,
        quantity: Number(row.quantity ?? 0),
        order_item_id: oi?.id ?? null,
        production_order_id: opId,
        op_number: op?.order_number ?? null,
        line_id: lineId,
        line_name: lineId ? lineNameById.get(lineId) ?? null : null,
        item_pcp_deadline: itemPcpRaw,
        pcp_deadline: itemPcp,
        purchase_order_status: poStatus,
        purchase_order_id: poi?.purchase_order_id ?? null,
        purchase_order_item_id: poi?.id ?? null,
        purchase_order_expected_delivery:
          maxPurchaseDelivery ?? poi?.expected_delivery ?? null,
        max_purchase_delivery_date: maxPurchaseDelivery,
        purchase_risk: purchaseRisk,
        production_status: oi?.status ?? null,
        production_completed_at: oi?.completed_at ?? null,
        production_start: oi?.production_start ?? null,
        production_end: oi?.production_end ?? null,
        apontamento_start_at: oi?.apontamento_start_at ?? null,
        apontamento_end_at: oi?.apontamento_end_at ?? null,
        quality_control: oi?.quality_control ?? null,
        production_notes: oi?.production_notes ?? null,
        can_start_production: canStart,
        order_source: "sales",
        product_type: prod?.type ?? null,
        product_nature: prod?.product_nature ?? null,
        has_composition: prod?.has_composition === true,
        has_bom: hasBom,
        quantity_on_hand: onHand,
        origin: origin.origin,
        origin_kind: origin.kind,
        origin_label: origin.label,
      });
    }

    const productionDeadline = computeOrderProductionDeadline(itemRows, null);
    const expectedDelivery = dateOnly(so.expected_delivery);
    const deliveryDeadlineForTraffic =
      expectedDelivery ??
      salesOrderDeliveryDeadlineFallback(
        so as {
          quotes?: {
            expected_delivery_date: string | null;
            delivery_deadline: string | null;
          } | null;
        }
      );

    result.push({
      id: so.id,
      order_number: so.order_number,
      client_name: so.client_name,
      created_at: so.created_at,
      status: so.status,
      order_source: "sales",
      ready_for_invoice: so.ready_for_invoice === true,
      /** Coluna «Prazo Vendas» — valor directo de `sales_orders.expected_delivery`. */
      expected_delivery: expectedDelivery,
      /** Farol / comparações quando o pedido ainda não tem prazo gravado. */
      delivery_deadline: deliveryDeadlineForTraffic,
      pcp_deadline: orderPcp,
      production_deadline: productionDeadline,
      items: itemRows,
    });
  }

  const stockOrders = await fetchStockOrdersForPlanning(
    admin,
    tenantId,
    lineNameById,
    inventoryByProduct,
    hasBomByProduct
  );
  result.push(...stockOrders);

  return result;
}

async function fetchStockOrdersForPlanning(
  admin: Admin,
  tenantId: string,
  lineNameById: Map<string, string>,
  inventoryByProduct: Map<string, number>,
  hasBomByProduct: Set<string>
): Promise<PcpPlanningOrder[]> {
  const { data: stockOps, error: opErr } = await admin
    .from("production_orders")
    .select("id, order_number, status, created_at, client_name")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("source_kind", "stock")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (opErr) throw new Error(opErr.message);
  const ops = stockOps ?? [];
  if (ops.length === 0) return [];

  const opIds = ops.map((o) => o.id);
  const { data: oiRows, error: oiErr } = await admin
    .from("order_items")
    .select(
      `
      id,
      order_id,
      item_number,
      description,
      quantity,
      unit,
      product_id,
      line_id,
      status,
      production_start,
      production_end,
      apontamento_start_at,
      apontamento_end_at,
      completed_at,
      quality_control,
      production_notes,
      pcp_deadline,
      product:products!order_items_product_id_fkey(
        id,
        technical_code,
        name,
        type,
        product_nature,
        has_composition,
        default_production_line_id
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("order_id", opIds);

  if (oiErr) throw new Error(oiErr.message);

  const itemsByOp = new Map<string, typeof oiRows>();
  for (const oi of oiRows ?? []) {
    const list = itemsByOp.get(oi.order_id) ?? [];
    list.push(oi);
    itemsByOp.set(oi.order_id, list);
  }

  const out: PcpPlanningOrder[] = [];

  for (const op of ops) {
    const rows = itemsByOp.get(op.id) ?? [];
    if (rows.length === 0) continue;

    const itemRows: PcpPlanningItem[] = [];
    let lineNum = 0;
    for (const oi of rows) {
      lineNum += 1;
      const prod = oi.product as {
        technical_code?: string;
        name?: string;
        type?: string;
        product_nature?: string | null;
        has_composition?: boolean;
        default_production_line_id?: string | null;
      } | null;
      const lineId = oi.line_id ?? prod?.default_production_line_id ?? null;
      const productId = oi.product_id;
      const hasBom =
        (productId != null && hasBomByProduct.has(productId)) ||
        prod?.has_composition === true;
      const origin = resolvePcpItemOrigin({
        product_type: prod?.type ?? null,
        product_nature: prod?.product_nature ?? null,
        has_bom: hasBom,
        has_composition: prod?.has_composition === true,
      });
      const stockOrigin: PcpPlanningItem["origin_kind"] =
        origin.kind === "comprar" ? "estoque" : origin.kind;

      itemRows.push({
        id: `${op.id}-${oi.id}`,
        line_number: oi.item_number ?? lineNum,
        product_id: productId,
        product_code: prod?.technical_code ?? null,
        product_name: prod?.name ?? oi.description,
        quantity: Number(oi.quantity ?? 0),
        order_item_id: oi.id,
        production_order_id: op.id,
        op_number: op.order_number,
        line_id: lineId,
        line_name: lineId ? lineNameById.get(lineId) ?? null : null,
        item_pcp_deadline: dateOnly(oi.pcp_deadline),
        pcp_deadline: dateOnly(oi.pcp_deadline),
        purchase_order_status: null,
        purchase_order_id: null,
        purchase_order_item_id: null,
        purchase_order_expected_delivery: null,
        max_purchase_delivery_date: null,
        purchase_risk: null,
        production_status: oi.status,
        production_completed_at: oi.completed_at ?? null,
        production_start: oi.production_start,
        production_end: oi.production_end,
        apontamento_start_at: oi.apontamento_start_at ?? null,
        apontamento_end_at: oi.apontamento_end_at ?? null,
        quality_control: oi.quality_control ?? null,
        production_notes: oi.production_notes ?? null,
        can_start_production: true,
        product_type: prod?.type ?? null,
        product_nature: prod?.product_nature ?? null,
        has_composition: prod?.has_composition === true,
        has_bom: hasBom,
        quantity_on_hand:
          productId != null ? (inventoryByProduct.get(productId) ?? 0) : 0,
        origin: "Estoque",
        origin_kind: stockOrigin,
        origin_label: "OP Estoque",
        order_source: "stock",
      });
    }

    out.push({
      id: op.id,
      order_number: op.order_number,
      client_name: op.client_name ?? "Estoque",
      created_at: op.created_at,
      status: op.status,
      order_source: "stock",
      ready_for_invoice: false,
      expected_delivery: null,
      delivery_deadline: null,
      pcp_deadline: null,
      production_deadline: computeOrderProductionDeadline(itemRows, null),
      items: itemRows,
    });
  }

  return out;
}

/** Itens activos por linha de produção (não finalizados). */
export async function fetchPcpPlanningByLine(
  admin: Admin,
  tenantId: string,
  lineId: string
): Promise<PcpPlanningItem[]> {
  const orders = await fetchPcpPlanning(admin, tenantId);
  const out: PcpPlanningItem[] = [];
  for (const ord of orders) {
    for (const it of ord.items) {
      if (it.line_id !== lineId) continue;
      if (
        isOrderItemProductionFinished({
          production_start: it.production_start,
          production_end: it.production_end,
          status: it.production_status,
          completed_at: it.production_completed_at,
          apontamento_start_at: it.apontamento_start_at,
          apontamento_end_at: it.apontamento_end_at,
        })
      ) {
        continue;
      }
      out.push({
        ...it,
        product_name: `${ord.order_number} · ${it.product_name}`,
      });
    }
  }
  return out;
}
