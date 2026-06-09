import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

const MOVEMENT_TYPES = new Set(["in", "out", "adjustment"]);

export type InventoryMovementOrigin =
  | {
      kind: "purchase_order";
      label: string;
      po_number: string;
      purchase_order_id: string;
    }
  | {
      kind: "invoice";
      label: string;
      invoice_number: string | null;
    }
  | {
      kind: "unknown";
      label: string;
    };

export type InventoryMovementListItem = {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  product: {
    id: string;
    technical_code: string | null;
    name: string | null;
  } | null;
  origin: InventoryMovementOrigin;
};

export type ListInventoryMovementsParams = {
  page: number;
  limit: number;
  productId?: string;
  movementType?: string;
  from?: string;
  to?: string;
};

export type ListInventoryMovementsResult = {
  data: InventoryMovementListItem[];
  pagination: { page: number; limit: number; total: number };
};

type MovementRow = {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  reference_id: string | null;
  product_id: string;
  product:
    | {
        id: string;
        technical_code: string | null;
        name: string | null;
      }
    | {
        id: string;
        technical_code: string | null;
        name: string | null;
      }[]
    | null;
};

type PoOriginRow = {
  id: string;
  purchase_order_id: string | null;
  purchase_order:
    | { id: string; po_number: string }
    | { id: string; po_number: string }[]
    | null;
};

function normalizeProduct(
  product: MovementRow["product"]
): InventoryMovementListItem["product"] {
  if (!product) return null;
  const p = Array.isArray(product) ? product[0] : product;
  if (!p?.id) return null;
  return {
    id: p.id,
    technical_code: p.technical_code ?? null,
    name: p.name ?? null,
  };
}

function shortUuid(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}

function resolveOrigin(
  referenceId: string | null,
  reason: string | null,
  poMap: Map<string, { po_number: string; purchase_order_id: string }>,
  invoiceMap: Map<string, { invoice_number: string | null }>
): InventoryMovementOrigin {
  if (referenceId) {
    const po = poMap.get(referenceId);
    if (po) {
      return {
        kind: "purchase_order",
        label: `PC ${po.po_number}`,
        po_number: po.po_number,
        purchase_order_id: po.purchase_order_id,
      };
    }

    const inv = invoiceMap.get(referenceId);
    if (inv) {
      const num = inv.invoice_number?.trim() || shortUuid(referenceId);
      return {
        kind: "invoice",
        label: `NF-e ${num}`,
        invoice_number: inv.invoice_number,
      };
    }
  }

  const fallback = reason?.trim() || "Origem não identificada";
  return { kind: "unknown", label: fallback };
}

async function buildOriginMaps(
  admin: Admin,
  tenantId: string,
  referenceIds: string[]
): Promise<{
  poMap: Map<string, { po_number: string; purchase_order_id: string }>;
  invoiceMap: Map<string, { invoice_number: string | null }>;
}> {
  const poMap = new Map<
    string,
    { po_number: string; purchase_order_id: string }
  >();
  const invoiceMap = new Map<string, { invoice_number: string | null }>();

  if (!referenceIds.length) {
    return { poMap, invoiceMap };
  }

  const uniqueRefs = [...new Set(referenceIds)];

  const { data: poiRows, error: poiErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, purchase_order_id, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(id, po_number)"
    )
    .eq("tenant_id", tenantId)
    .in("id", uniqueRefs);

  if (poiErr) throw new Error(poiErr.message);

  for (const row of (poiRows ?? []) as unknown as PoOriginRow[]) {
    const poRaw = row.purchase_order;
    const po = Array.isArray(poRaw) ? poRaw[0] : poRaw;
    if (!po?.id || !po.po_number || !row.purchase_order_id) continue;
    poMap.set(row.id, {
      po_number: po.po_number,
      purchase_order_id: po.id,
    });
  }

  const { data: invRows, error: invErr } = await admin
    .from("supplier_invoices")
    .select("id, invoice_number")
    .eq("tenant_id", tenantId)
    .in("id", uniqueRefs);

  if (invErr) throw new Error(invErr.message);

  for (const row of invRows ?? []) {
    invoiceMap.set(row.id, {
      invoice_number: row.invoice_number ?? null,
    });
  }

  return { poMap, invoiceMap };
}

export function isInventoryMovementType(
  value: string
): value is "in" | "out" | "adjustment" {
  return MOVEMENT_TYPES.has(value);
}

export async function listInventoryMovements(
  admin: Admin,
  tenantId: string,
  params: ListInventoryMovementsParams
): Promise<ListInventoryMovementsResult> {
  const page = Math.max(1, params.page);
  const limit = Math.min(100, Math.max(1, params.limit));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = admin
    .from("inventory_movements")
    .select(
      `
      id,
      created_at,
      movement_type,
      quantity,
      reason,
      reference_id,
      product_id,
      product:products!inventory_movements_product_id_fkey(id, technical_code, name)
    `.trim(),
      { count: "exact" }
    )
    .eq("tenant_id", tenantId);

  if (params.productId) {
    q = q.eq("product_id", params.productId);
  }
  if (params.movementType) {
    q = q.eq("movement_type", params.movementType);
  }
  if (params.from) {
    q = q.gte("created_at", `${params.from}T00:00:00`);
  }
  if (params.to) {
    q = q.lte("created_at", `${params.to}T23:59:59.999`);
  }

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as MovementRow[];
  const referenceIds = rows
    .map((r) => r.reference_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const { poMap, invoiceMap } = await buildOriginMaps(
    admin,
    tenantId,
    referenceIds
  );

  const items: InventoryMovementListItem[] = rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    movement_type: row.movement_type,
    quantity: Number(row.quantity),
    reason: row.reason,
    product: normalizeProduct(row.product),
    origin: resolveOrigin(row.reference_id, row.reason, poMap, invoiceMap),
  }));

  return {
    data: items,
    pagination: { page, limit, total: count ?? 0 },
  };
}
