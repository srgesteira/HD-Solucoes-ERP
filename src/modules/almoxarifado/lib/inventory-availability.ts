import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { mrSaldoFuturoIncludesProduction } from "@/modules/engenharia/lib/products/mrp-product-nature";

type Admin = SupabaseClient<Database>;

export function roundInventoryQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/** Status de PC com quantidade ainda por receber (saldo futuro). */
const INCOMING_PO_STATUSES = ["confirmed", "partial", "sent"] as const;

/** OPs activas — qty em produção conta até finalizar. */
const ACTIVE_PO_STATUSES = [
  "imported",
  "planning",
  "in_production",
  "ready",
  "delayed",
] as const;

export type ProductAvailability = {
  product_id: string;
  product_nature: string | null;
  quantity_on_hand: number;
  reserved_quantity: number;
  quantity_in_production: number;
  quantity_incoming: number;
  /** Requisições / PCs em rascunho ainda sem cabeçalho. */
  quantity_incoming_draft: number;
  reorder_point: number;
  reorder_quantity: number;
  /** Saldo futuro (sem clamp): real ± produção + compras − empenho. */
  saldo_futuro: number;
  /** Legado: max(0, real + futuro + produção − empenho) */
  available: number;
  shortage_legacy_on_hand_only: (needed: number) => number;
};

export type ProductAvailabilityMap = Map<string, ProductAvailability>;

function emptyAvailability(productId: string): ProductAvailability {
  return {
    product_id: productId,
    product_nature: null,
    quantity_on_hand: 0,
    reserved_quantity: 0,
    quantity_in_production: 0,
    quantity_incoming: 0,
    quantity_incoming_draft: 0,
    reorder_point: 0,
    reorder_quantity: 0,
    saldo_futuro: 0,
    available: 0,
    shortage_legacy_on_hand_only: (needed) =>
      roundInventoryQty(Math.max(0, needed)),
  };
}

export function computeSaldoFuturo(row: {
  quantity_on_hand: number;
  reserved_quantity: number;
  quantity_in_production: number;
  quantity_incoming: number;
  quantity_incoming_draft: number;
  product_nature: string | null;
}): number {
  const onHand = roundInventoryQty(row.quantity_on_hand);
  const reserved = roundInventoryQty(row.reserved_quantity);
  const inProd = roundInventoryQty(row.quantity_in_production);
  const incoming = roundInventoryQty(row.quantity_incoming);
  const incomingDraft = roundInventoryQty(row.quantity_incoming_draft);
  const prodTerm = mrSaldoFuturoIncludesProduction(row.product_nature)
    ? inProd
    : 0;
  return roundInventoryQty(onHand + prodTerm + incoming + incomingDraft - reserved);
}

/** Compra para repor até o estoque mínimo quando saldo_futuro < reorder_point. */
export function purchaseQtyFromSaldoMinimum(
  saldoFuturo: number,
  reorderPoint: number | null | undefined,
  reorderQuantity: number | null | undefined
): number {
  const minimum = reorderPoint ?? 0;
  if (saldoFuturo >= minimum - 0.0001) return 0;
  const gap = roundInventoryQty(minimum - saldoFuturo);
  const lot = reorderQuantity ?? 0;
  if (lot > 0 && lot > gap) return roundInventoryQty(lot);
  return gap;
}

/** Necessidade de compra: max(falta BOM, reposição até mínimo). */
export function computePurchaseShortage(
  needed: number,
  saldoFuturo: number,
  reorderPoint: number | null | undefined,
  reorderQuantity: number | null | undefined
): number {
  const bomShortage = roundInventoryQty(Math.max(0, needed - saldoFuturo));
  const minShortage = purchaseQtyFromSaldoMinimum(
    saldoFuturo,
    reorderPoint,
    reorderQuantity
  );
  return roundInventoryQty(Math.max(bomShortage, minShortage));
}

function buildAvailability(row: {
  product_id: string;
  product_nature: string | null;
  quantity_on_hand: number;
  reserved_quantity: number;
  quantity_in_production: number;
  quantity_incoming: number;
  quantity_incoming_draft: number;
  reorder_point: number;
  reorder_quantity: number;
}): ProductAvailability {
  const onHand = roundInventoryQty(row.quantity_on_hand);
  const reserved = roundInventoryQty(row.reserved_quantity);
  const inProd = roundInventoryQty(row.quantity_in_production);
  const incoming = roundInventoryQty(row.quantity_incoming);
  const incomingDraft = roundInventoryQty(row.quantity_incoming_draft);
  const saldo_futuro = computeSaldoFuturo({
    quantity_on_hand: onHand,
    reserved_quantity: reserved,
    quantity_in_production: inProd,
    quantity_incoming: incoming,
    quantity_incoming_draft: incomingDraft,
    product_nature: row.product_nature,
  });
  const available = roundInventoryQty(
    Math.max(0, onHand + incoming + inProd - reserved)
  );
  return {
    product_id: row.product_id,
    product_nature: row.product_nature,
    quantity_on_hand: onHand,
    reserved_quantity: reserved,
    quantity_in_production: inProd,
    quantity_incoming: incoming,
    quantity_incoming_draft: incomingDraft,
    reorder_point: roundInventoryQty(row.reorder_point),
    reorder_quantity: roundInventoryQty(row.reorder_quantity),
    saldo_futuro,
    available,
    shortage_legacy_on_hand_only: (needed) =>
      roundInventoryQty(Math.max(0, needed - onHand)),
  };
}

/**
 * Agrega os 4 estados de estoque por produto (batch).
 * Usado pelo MRP, API de check e relatórios — não altera dados.
 */
export async function fetchProductAvailabilityMap(
  admin: Admin,
  tenantId: string,
  productIds: string[]
): Promise<ProductAvailabilityMap> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const map = new Map<string, ProductAvailability>();
  if (!ids.length) return map;

  for (const id of ids) {
    map.set(id, emptyAvailability(id));
  }

  const natureByProduct = new Map<string, string | null>();
  const { data: prodRows, error: prodMetaErr } = await admin
    .from("products")
    .select("id, product_nature")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (prodMetaErr) throw new Error(prodMetaErr.message);
  for (const p of prodRows ?? []) {
    natureByProduct.set(p.id, p.product_nature ?? null);
  }

  const { data: invRows, error: invErr } = await admin
    .from("inventory")
    .select(
      "product_id, quantity_on_hand, reserved_quantity, reorder_point, reorder_quantity"
    )
    .eq("tenant_id", tenantId)
    .in("product_id", ids);

  if (invErr) throw new Error(invErr.message);

  const inProdByProduct = new Map<string, number>();
  const { data: orderItemRows, error: prodErr } = await admin
    .from("order_items")
    .select(
      "product_id, quantity, apontamento_end_at, completed_at, status, production_orders!inner(status)"
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("product_id", ids)
    .in("production_orders.status", [...ACTIVE_PO_STATUSES]);

  if (prodErr) throw new Error(prodErr.message);

  for (const row of orderItemRows ?? []) {
    if (!row.product_id) continue;
    if (row.apontamento_end_at || row.completed_at || row.status === "completed") {
      continue;
    }
    const q = Number(row.quantity ?? 0);
    if (!Number.isFinite(q) || q <= 0) continue;
    inProdByProduct.set(
      row.product_id,
      roundInventoryQty((inProdByProduct.get(row.product_id) ?? 0) + q)
    );
  }

  const incomingByProduct = new Map<string, number>();
  const { data: poiRows, error: poiErr } = await admin
    .from("purchase_order_items")
    .select(
      "product_id, quantity, received_quantity, purchase_orders!inner(status, is_suggestion)"
    )
    .eq("tenant_id", tenantId)
    .in("product_id", ids)
    .not("purchase_order_id", "is", null);

  if (poiErr) throw new Error(poiErr.message);

  for (const row of poiRows ?? []) {
    if (!row.product_id) continue;
    const po = Array.isArray(row.purchase_orders)
      ? row.purchase_orders[0]
      : row.purchase_orders;
    if (!po || po.is_suggestion) continue;
    if (
      !(INCOMING_PO_STATUSES as readonly string[]).includes(String(po.status ?? ""))
    ) {
      continue;
    }
    const pending = Math.max(
      0,
      Number(row.quantity ?? 0) - Number(row.received_quantity ?? 0)
    );
    if (pending <= 0) continue;
    incomingByProduct.set(
      row.product_id,
      roundInventoryQty((incomingByProduct.get(row.product_id) ?? 0) + pending)
    );
  }

  const incomingDraftByProduct = new Map<string, number>();
  const { data: draftRows, error: draftErr } = await admin
    .from("purchase_order_items")
    .select("product_id, quantity")
    .eq("tenant_id", tenantId)
    .in("product_id", ids)
    .is("purchase_order_id", null)
    .eq("status", "draft");

  if (draftErr) throw new Error(draftErr.message);

  for (const row of draftRows ?? []) {
    if (!row.product_id) continue;
    const q = Number(row.quantity ?? 0);
    if (!Number.isFinite(q) || q <= 0) continue;
    incomingDraftByProduct.set(
      row.product_id,
      roundInventoryQty((incomingDraftByProduct.get(row.product_id) ?? 0) + q)
    );
  }

  for (const id of ids) {
    const inv = (invRows ?? []).find((r) => r.product_id === id);
    map.set(
      id,
      buildAvailability({
        product_id: id,
        product_nature: natureByProduct.get(id) ?? null,
        quantity_on_hand: Number(inv?.quantity_on_hand ?? 0),
        reserved_quantity: Number(inv?.reserved_quantity ?? 0),
        reorder_point: Number(inv?.reorder_point ?? 0),
        reorder_quantity: Number(inv?.reorder_quantity ?? 0),
        quantity_in_production: inProdByProduct.get(id) ?? 0,
        quantity_incoming: incomingByProduct.get(id) ?? 0,
        quantity_incoming_draft: incomingDraftByProduct.get(id) ?? 0,
      })
    );
  }

  return map;
}

export async function fetchProductAvailability(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<ProductAvailability> {
  const map = await fetchProductAvailabilityMap(admin, tenantId, [productId]);
  return map.get(productId) ?? emptyAvailability(productId);
}

/** Legado: max(0, needed − available clampado). Preferir computePurchaseShortage no MRP. */
export function shortageFromAvailability(
  needed: number,
  availability: ProductAvailability
): number {
  return roundInventoryQty(Math.max(0, needed - availability.available));
}
