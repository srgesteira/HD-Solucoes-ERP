import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { roundInventoryQty } from "@/modules/almoxarifado/lib/inventory-availability";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import {
  calculateNeededMaterialsForProductQty,
  type GrossMaterialNeed,
} from "@/modules/pcp/lib/mrp-service";
import { filterPhysicalSupplyNeeds } from "@/modules/almoxarifado/lib/production-supply-needs";
import {
  mrSalesLineEligibleForProductionOrder,
  type MrpProductNatureMeta,
} from "@/modules/engenharia/lib/products/mrp-product-nature";

type Admin = SupabaseClient<Database>;

export const RESERVATION_SOURCE_KINDS = [
  "production_order_item",
  "sales_order_item",
] as const;

export type ReservationSourceKind =
  (typeof RESERVATION_SOURCE_KINDS)[number];

type ReservationRow = {
  id: string;
  product_id: string;
  quantity: number;
  source_kind: string;
  source_id: string;
};

/** Sincroniza inventory.reserved_quantity = SUM(reservas activas) por produto. */
export async function syncInventoryReservedAggregate(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { data: rows, error: qErr } = await db
    .from("inventory_reservations")
    .select("quantity")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .is("released_at", null);

  if (qErr) throw new Error(qErr.message);

  const total = roundInventoryQty(
    (rows ?? []).reduce(
      (s: number, r: { quantity?: number | null }) =>
        s + Number(r.quantity ?? 0),
      0
    )
  );

  const { data: existing, error: fErr } = await admin
    .from("inventory")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (fErr) throw new Error(fErr.message);

  if (existing?.id) {
    const { error: uErr } = await admin
      .from("inventory")
      .update({ reserved_quantity: total })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (uErr) throw new Error(uErr.message);
  } else if (total > 0) {
    const { error: iErr } = await admin.from("inventory").insert({
      tenant_id: tenantId,
      product_id: productId,
      quantity_on_hand: 0,
      reserved_quantity: total,
      reorder_point: 0,
      reorder_quantity: 0,
    });
    if (iErr) throw new Error(iErr.message);
  }
}

async function upsertActiveReservation(
  admin: Admin,
  args: {
    tenantId: string;
    productId: string;
    quantity: number;
    sourceKind: ReservationSourceKind;
    sourceId: string;
    productionOrderId?: string | null;
    orderItemId?: string | null;
    salesOrderId?: string | null;
    salesOrderItemId?: string | null;
    notes?: string | null;
    userId?: string | null;
  }
): Promise<ReservationRow> {
  const db = asUntypedAdmin(admin);
  const qty = roundInventoryQty(args.quantity);
  if (qty <= 0) throw new Error("Quantidade de empenho inválida.");

  const { data: existing } = await db
    .from("inventory_reservations")
    .select("id, quantity")
    .eq("tenant_id", args.tenantId)
    .eq("source_kind", args.sourceKind)
    .eq("source_id", args.sourceId)
    .eq("product_id", args.productId)
    .is("released_at", null)
    .maybeSingle();

  let row: ReservationRow;
  if (existing?.id) {
    const { data, error } = await db
      .from("inventory_reservations")
      .update({ quantity: qty, notes: args.notes ?? null })
      .eq("id", existing.id)
      .eq("tenant_id", args.tenantId)
      .select("id, product_id, quantity, source_kind, source_id")
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Falha ao actualizar empenho");
    row = data as ReservationRow;
  } else {
    const { data, error } = await db
      .from("inventory_reservations")
      .insert({
        tenant_id: args.tenantId,
        product_id: args.productId,
        quantity: qty,
        source_kind: args.sourceKind,
        source_id: args.sourceId,
        production_order_id: args.productionOrderId ?? null,
        order_item_id: args.orderItemId ?? null,
        sales_order_id: args.salesOrderId ?? null,
        sales_order_item_id: args.salesOrderItemId ?? null,
        notes: args.notes ?? null,
        created_by: args.userId ?? null,
      })
      .select("id, product_id, quantity, source_kind, source_id")
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Falha ao criar empenho");
    row = data as ReservationRow;
  }

  await syncInventoryReservedAggregate(admin, args.tenantId, args.productId);
  return row;
}

export async function releaseReservationsBySource(
  admin: Admin,
  args: {
    tenantId: string;
    sourceKind: ReservationSourceKind;
    sourceId: string;
    releaseReason: string;
    userId?: string | null;
    userEmail?: string | null;
    partialByProduct?: Map<string, number>;
  }
): Promise<{ released: number; products: string[] }> {
  const db = asUntypedAdmin(admin);
  const { data: active, error: qErr } = await db
    .from("inventory_reservations")
    .select("id, product_id, quantity")
    .eq("tenant_id", args.tenantId)
    .eq("source_kind", args.sourceKind)
    .eq("source_id", args.sourceId)
    .is("released_at", null);

  if (qErr) throw new Error(qErr.message);
  if (!active?.length) return { released: 0, products: [] };

  const now = new Date().toISOString();
  const touchedProducts = new Set<string>();
  let released = 0;

  for (const row of active) {
    const pid = row.product_id as string;
    const fullQty = Number(row.quantity ?? 0);
    const partialQty = args.partialByProduct?.get(pid);
    touchedProducts.add(pid);

    if (partialQty != null && partialQty + 0.0001 < fullQty) {
      const remain = roundInventoryQty(fullQty - partialQty);
      await db
        .from("inventory_reservations")
        .update({ quantity: remain })
        .eq("id", row.id)
        .eq("tenant_id", args.tenantId);
      released += partialQty;
    } else {
      await db
        .from("inventory_reservations")
        .update({
          released_at: now,
          release_reason: args.releaseReason,
        })
        .eq("id", row.id)
        .eq("tenant_id", args.tenantId);
      released += fullQty;
    }
  }

  for (const productId of touchedProducts) {
    await syncInventoryReservedAggregate(admin, args.tenantId, productId);
  }

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId ?? null,
    actorEmail: args.userEmail ?? null,
    table: "inventory_reservations",
    recordId: args.sourceId,
    eventKind: "inventory_reservation_released",
    payload: {
      source_kind: args.sourceKind,
      source_id: args.sourceId,
      release_reason: args.releaseReason,
      quantity_released: released,
      product_ids: [...touchedProducts],
    },
  });

  return { released, products: [...touchedProducts] };
}

/** Fatia 1.1 — empenhar materiais da BOM ao efetivar MRP (item de OP). */
export async function reserveMaterialsForProductionOrderItem(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  userId?: string | null
): Promise<{ reservations: number }> {
  const { data: item, error: itemErr } = await admin
    .from("order_items")
    .select(
      "id, order_id, product_id, quantity, is_suggestion, production_order:production_orders!order_items_order_id_fkey(id, order_number, is_suggestion)"
    )
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (itemErr) throw new Error(itemErr.message);
  if (!item?.product_id) return { reservations: 0 };

  const poRaw = item.production_order as
    | { id: string; order_number: string; is_suggestion: boolean }
    | { id: string; order_number: string; is_suggestion: boolean }[]
    | null;
  const po = Array.isArray(poRaw) ? poRaw[0] : poRaw;
  if (!po || po.is_suggestion || item.is_suggestion) return { reservations: 0 };

  const qty = Number(item.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return { reservations: 0 };

  const bomNeeds = await calculateNeededMaterialsForProductQty(
    admin,
    tenantId,
    item.product_id,
    qty
  );
  const needs = await filterPhysicalSupplyNeeds(admin, tenantId, bomNeeds);
  if (!needs.length) return { reservations: 0 };

  let count = 0;
  for (const need of needs) {
    await upsertActiveReservation(admin, {
      tenantId,
      productId: need.product_id,
      quantity: need.gross_qty,
      sourceKind: "production_order_item",
      sourceId: orderItemId,
      productionOrderId: po.id,
      orderItemId,
      notes: `Empenho MRP OP ${po.order_number}`,
      userId,
    });
    count += 1;
  }

  if (count > 0) {
    await recordAuditEvent(admin, {
      tenantId,
      actorId: userId ?? null,
      table: "order_items",
      recordId: orderItemId,
      eventKind: "inventory_reservation_created",
      payload: {
        source_kind: "production_order_item",
        materials: needs.map((n) => ({
          product_id: n.product_id,
          quantity: n.gross_qty,
        })),
        production_order_id: po.id,
      },
    });
  }

  return { reservations: count };
}

/** Fatia 1.2 — libera empenho proporcional ao abastecer. */
export async function releaseProductionSupplyReservations(
  admin: Admin,
  args: {
    tenantId: string;
    orderItemId: string;
    materials: GrossMaterialNeed[];
    userId?: string | null;
    userEmail?: string | null;
  }
): Promise<void> {
  const partial = new Map<string, number>();
  for (const m of args.materials) {
    partial.set(m.product_id, roundInventoryQty(m.gross_qty));
  }
  await releaseReservationsBySource(admin, {
    tenantId: args.tenantId,
    sourceKind: "production_order_item",
    sourceId: args.orderItemId,
    releaseReason: "production_supply",
    userId: args.userId,
    userEmail: args.userEmail,
    partialByProduct: partial,
  });
}

/** Fatia 1.3 — cancelamento OP antes de abastecer. */
export async function releaseProductionOrderItemReservations(
  admin: Admin,
  args: {
    tenantId: string;
    productionOrderId: string;
    userId?: string | null;
    userEmail?: string | null;
  }
): Promise<void> {
  const { data: items, error } = await admin
    .from("order_items")
    .select("id, warehouse_supplied_at")
    .eq("tenant_id", args.tenantId)
    .eq("order_id", args.productionOrderId);

  if (error) throw new Error(error.message);

  for (const item of items ?? []) {
    if (item.warehouse_supplied_at) continue;
    await releaseReservationsBySource(admin, {
      tenantId: args.tenantId,
      sourceKind: "production_order_item",
      sourceId: item.id,
      releaseReason: "production_order_cancelled",
      userId: args.userId,
      userEmail: args.userEmail,
    });
  }
}

async function loadProductNatureMeta(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<MrpProductNatureMeta | null> {
  const { data, error } = await admin
    .from("products")
    .select(
      "product_nature, has_composition, type, prefix:product_prefixes!products_prefix_id_fkey(code)"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) return null;
  const prefix = Array.isArray(data.prefix) ? data.prefix[0] : data.prefix;
  return {
    product_nature: data.product_nature,
    has_composition: data.has_composition === true,
    type: data.type,
  };
}

/** Fatia 1.4 — empenhar acabado/revenda ao confirmar PV. */
export async function reserveFinishedGoodsForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  userId?: string | null
): Promise<{ reservations: number }> {
  const { data: items, error } = await admin
    .from("sales_order_items")
    .select("id, product_id, quantity")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (error) throw new Error(error.message);

  let count = 0;
  for (const line of items ?? []) {
    if (!line.product_id) continue;
    const meta = await loadProductNatureMeta(admin, tenantId, line.product_id);
    if (!meta) continue;
    if (mrSalesLineEligibleForProductionOrder(meta)) continue;

    const qty = Number(line.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    await upsertActiveReservation(admin, {
      tenantId,
      productId: line.product_id,
      quantity: qty,
      sourceKind: "sales_order_item",
      sourceId: line.id,
      salesOrderId,
      salesOrderItemId: line.id,
      notes: `Empenho PV confirmado`,
      userId,
    });
    count += 1;
  }

  if (count > 0) {
    await recordAuditEvent(admin, {
      tenantId,
      actorId: userId ?? null,
      table: "sales_orders",
      recordId: salesOrderId,
      eventKind: "inventory_reservation_created",
      payload: { source_kind: "sales_order_item", lines: count },
    });
  }

  return { reservations: count };
}

/** Libera empenho de acabado na expedição / cancelamento PV. */
export async function releaseSalesOrderFinishedGoodsReservations(
  admin: Admin,
  args: {
    tenantId: string;
    salesOrderId: string;
    releaseReason: string;
    userId?: string | null;
    userEmail?: string | null;
  }
): Promise<void> {
  const { data: items, error } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("sales_order_id", args.salesOrderId);

  if (error) throw new Error(error.message);

  for (const line of items ?? []) {
    await releaseReservationsBySource(admin, {
      tenantId: args.tenantId,
      sourceKind: "sales_order_item",
      sourceId: line.id,
      releaseReason: args.releaseReason,
      userId: args.userId,
      userEmail: args.userEmail,
    });
  }
}
