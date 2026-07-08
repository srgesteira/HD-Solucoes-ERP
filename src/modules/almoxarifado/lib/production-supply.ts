import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { applyInventoryOutbound } from "@/modules/almoxarifado/lib/inventory-outbound";
import { INVENTORY_ORIGIN } from "@/modules/almoxarifado/lib/inventory-origins";
import { removeLegacyMrpEmpenhoForProductionOrder } from "@/modules/almoxarifado/lib/legacy-mrp-empenho";
import { filterPhysicalSupplyNeeds } from "@/modules/almoxarifado/lib/production-supply-needs";
import { fetchProductAvailabilityMap } from "@/modules/almoxarifado/lib/inventory-availability";
import {
  releaseProductionSupplyReservations,
} from "@/modules/almoxarifado/lib/inventory-reservations";
import {
  calculateNeededMaterialsForProductQty,
  type GrossMaterialNeed,
} from "@/modules/pcp/lib/mrp-service";

type Admin = SupabaseClient<Database>;

export const PRODUCTION_SUPPLY_ORIGIN = INVENTORY_ORIGIN.PRODUCTION_SUPPLY;

export type ProductionSupplyPendingRow = {
  order_item_id: string;
  order_id: string;
  order_number: string;
  source_kind: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  pcp_deadline: string | null;
  status: string;
  apontamento_start_at: string | null;
  material_count: number;
};

export type ProductionSupplyBomLine = {
  /** Identificador estável da linha na UI (produto original da BOM). */
  line_key: string;
  original_product_id: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit: string | null;
  quantity_on_hand: number;
  reserved_quantity: number;
  available: number;
  substituted: boolean;
};

export type ProductionSupplyBomPreview = {
  order_item_id: string;
  order_id: string;
  order_number: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  lines: ProductionSupplyBomLine[];
};

export type ProductionSupplyMaterialOverride = {
  product_id: string;
  quantity: number;
  /** Produto original da BOM (para liberar empenho do item substituído). */
  original_product_id?: string | null;
};

export type ApplyProductionSupplyResult = {
  order_item_id: string;
  order_number: string;
  movements: number;
  materials: { product_id: string; quantity: number }[];
};

type PendingSupplyQueryRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  pcp_deadline: string | null;
  status: string;
  apontamento_start_at: string | null;
  product:
    | { id: string; technical_code: string | null; name: string | null }
    | { id: string; technical_code: string | null; name: string | null }[]
    | null;
  production_order:
    | {
        id: string;
        order_number: string;
        source_kind: string;
        status: string;
        is_suggestion: boolean;
      }
    | {
        id: string;
        order_number: string;
        source_kind: string;
        status: string;
        is_suggestion: boolean;
      }[]
    | null;
};

type SupplyItemQueryRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  warehouse_supplied_at: string | null;
  is_suggestion: boolean;
  production_order:
    | {
        id: string;
        order_number: string;
        status: string;
        is_suggestion: boolean;
      }
    | {
        id: string;
        order_number: string;
        status: string;
        is_suggestion: boolean;
      }[]
    | null;
};

async function countMaterialNeeds(
  admin: Admin,
  tenantId: string,
  productId: string,
  quantity: number
): Promise<number> {
  const needs = await calculateNeededMaterialsForProductQty(
    admin,
    tenantId,
    productId,
    quantity
  );
  return needs.length;
}

export async function listProductionSupplyPending(
  admin: Admin,
  tenantId: string
): Promise<ProductionSupplyPendingRow[]> {
  const { data: items, error } = await admin
    .from("order_items")
    .select(
      `
      id,
      order_id,
      product_id,
      quantity,
      pcp_deadline,
      status,
      apontamento_start_at,
      product:products!order_items_product_id_fkey(id, technical_code, name),
      production_order:production_orders!order_items_order_id_fkey(
        id,
        order_number,
        source_kind,
        status,
        is_suggestion
      )
    `.trim()
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .is("warehouse_supplied_at", null)
    .not("product_id", "is", null)
    .order("pcp_deadline", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const rows: ProductionSupplyPendingRow[] = [];

  for (const raw of (items ?? []) as unknown as PendingSupplyQueryRow[]) {
    const poRaw = raw.production_order;
    const po = Array.isArray(poRaw) ? poRaw[0] : poRaw;
    if (!po?.id || po.is_suggestion) continue;
    if (po.status === "cancelled" || po.status === "finished") continue;

    const productRaw = raw.product;
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    if (!product?.id || !raw.product_id) continue;

    const qty = Number(raw.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const materialCount = await countMaterialNeeds(
      admin,
      tenantId,
      raw.product_id,
      qty
    );
    if (materialCount === 0) continue;

    rows.push({
      order_item_id: raw.id,
      order_id: raw.order_id,
      order_number: po.order_number,
      source_kind: po.source_kind ?? "sales",
      product_id: raw.product_id,
      product_code: product.technical_code ?? null,
      product_name: product.name ?? null,
      quantity: qty,
      pcp_deadline: raw.pcp_deadline,
      status: raw.status,
      apontamento_start_at: raw.apontamento_start_at,
      material_count: materialCount,
    });
  }

  return rows;
}

function nestOne<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

async function loadSupplyItemContext(
  admin: Admin,
  tenantId: string,
  orderItemId: string
) {
  const { data: item, error: itemErr } = await admin
    .from("order_items")
    .select(
      `
      id,
      order_id,
      product_id,
      quantity,
      warehouse_supplied_at,
      is_suggestion,
      product:products!order_items_product_id_fkey(id, technical_code, name),
      production_order:production_orders!order_items_order_id_fkey(
        id,
        order_number,
        status,
        is_suggestion
      )
    `.trim()
    )
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (itemErr) throw new Error(itemErr.message);
  if (!item) throw new Error("Item de produção não encontrado.");

  const row = item as unknown as SupplyItemQueryRow & {
    product:
      | { id: string; technical_code: string | null; name: string | null }
      | { id: string; technical_code: string | null; name: string | null }[]
      | null;
  };

  if (row.is_suggestion) {
    throw new Error("Não é possível abastecer uma sugestão do MRP.");
  }
  if (row.warehouse_supplied_at) {
    throw new Error("Este item já foi abastecido.");
  }

  const po = nestOne(row.production_order);
  if (!po?.id || po.is_suggestion) {
    throw new Error("Ordem de produção inválida.");
  }
  if (po.status === "cancelled") {
    throw new Error("Ordem de produção cancelada.");
  }

  const productId = row.product_id;
  if (!productId) throw new Error("Item sem produto associado.");

  const qty = Number(row.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantidade inválida no item de produção.");
  }

  const product = nestOne(row.product);

  return {
    orderItemId: row.id,
    orderId: row.order_id,
    productId,
    quantity: qty,
    orderNumber: po.order_number,
    poStatus: po.status,
    poId: po.id,
    productCode: product?.technical_code ?? null,
    productName: product?.name ?? null,
  };
}

/** Lista componentes físicos da BOM com saldo — para revisão/troca no almoxarifado. */
export async function getProductionSupplyBomPreview(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<ProductionSupplyBomPreview> {
  const ctx = await loadSupplyItemContext(admin, tenantId, orderItemId);

  const bomNeeds = await calculateNeededMaterialsForProductQty(
    admin,
    tenantId,
    ctx.productId,
    ctx.quantity
  );
  const needs = await filterPhysicalSupplyNeeds(admin, tenantId, bomNeeds);
  if (!needs.length) {
    throw new Error("Produto sem materiais físicos na BOM para abastecer.");
  }

  const productIds = needs.map((n) => n.product_id);
  const [{ data: products, error: prodErr }, availMap] = await Promise.all([
    admin
      .from("products")
      .select("id, technical_code, name, unit")
      .eq("tenant_id", tenantId)
      .in("id", productIds),
    fetchProductAvailabilityMap(admin, tenantId, productIds),
  ]);
  if (prodErr) throw new Error(prodErr.message);

  const byId = new Map(
    (products ?? []).map((p) => [
      p.id,
      {
        code: p.technical_code ?? null,
        name: p.name ?? null,
        unit: p.unit ?? null,
      },
    ])
  );

  const lines: ProductionSupplyBomLine[] = needs.map((n) => {
    const meta = byId.get(n.product_id);
    const avail = availMap.get(n.product_id);
    return {
      line_key: n.product_id,
      original_product_id: n.product_id,
      product_id: n.product_id,
      product_code: meta?.code ?? null,
      product_name: meta?.name ?? null,
      quantity: n.gross_qty,
      unit: meta?.unit ?? null,
      quantity_on_hand: avail?.quantity_on_hand ?? 0,
      reserved_quantity: avail?.reserved_quantity ?? 0,
      available: avail?.available ?? 0,
      substituted: false,
    };
  });

  lines.sort((a, b) =>
    (a.product_code ?? a.product_name ?? "").localeCompare(
      b.product_code ?? b.product_name ?? "",
      "pt"
    )
  );

  return {
    order_item_id: ctx.orderItemId,
    order_id: ctx.orderId,
    order_number: ctx.orderNumber,
    product_id: ctx.productId,
    product_code: ctx.productCode,
    product_name: ctx.productName,
    quantity: ctx.quantity,
    lines,
  };
}

/** Busca produtos activos para substituição no abastecimento. */
export async function searchSupplySubstituteProducts(
  admin: Admin,
  tenantId: string,
  search: string,
  excludeProductIds: string[] = []
): Promise<
  Array<{
    id: string;
    technical_code: string | null;
    name: string;
    unit: string | null;
    quantity_on_hand: number;
    available: number;
  }>
> {
  const q = search.trim();
  if (q.length < 2) return [];

  const escaped = q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  let query = admin
    .from("products")
    .select("id, technical_code, name, unit")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .or(
      `name.ilike.%${escaped}%,technical_code.ilike.%${escaped}%`
    )
    .order("technical_code", { ascending: true })
    .limit(40);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const exclude = new Set(excludeProductIds);
  const rows = (data ?? []).filter((r) => !exclude.has(r.id)).slice(0, 25);
  if (!rows.length) return [];

  const avail = await fetchProductAvailabilityMap(
    admin,
    tenantId,
    rows.map((r) => r.id)
  );

  return rows.map((r) => {
    const a = avail.get(r.id);
    return {
      id: r.id,
      technical_code: r.technical_code ?? null,
      name: r.name,
      unit: r.unit ?? null,
      quantity_on_hand: a?.quantity_on_hand ?? 0,
      available: a?.available ?? 0,
    };
  });
}

function normalizeMaterialOverrides(
  overrides: ProductionSupplyMaterialOverride[] | undefined
): GrossMaterialNeed[] | null {
  if (!overrides?.length) return null;
  const map = new Map<string, number>();
  for (const row of overrides) {
    const productId = typeof row.product_id === "string" ? row.product_id : "";
    const qty = Number(row.quantity);
    if (!productId || !Number.isFinite(qty) || qty <= 0) {
      throw new Error("Lista de materiais inválida (produto ou quantidade).");
    }
    map.set(productId, (map.get(productId) ?? 0) + qty);
  }
  return [...map.entries()].map(([product_id, gross_qty]) => ({
    product_id,
    gross_qty,
  }));
}

export type ProductionSupplyOptions = {
  /** Permite abastecer OP já fechada (correcção / backfill). */
  allowFinishedOrder?: boolean;
  /** Sem BOM: marca abastecido sem movimentos em vez de erro. */
  skipIfNoMaterials?: boolean;
  /**
   * Materiais efectivos a baixar (após troca pelo almoxarifado).
   * Quando omitido, usa a explosão estándar da BOM.
   */
  materials?: ProductionSupplyMaterialOverride[];
};

export async function applyProductionSupply(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  userId?: string | null,
  options?: ProductionSupplyOptions
): Promise<ApplyProductionSupplyResult> {
  const { data: item, error: itemErr } = await admin
    .from("order_items")
    .select(
      `
      id,
      order_id,
      product_id,
      quantity,
      warehouse_supplied_at,
      is_suggestion,
      production_order:production_orders!order_items_order_id_fkey(
        id,
        order_number,
        status,
        is_suggestion
      )
    `.trim()
    )
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (itemErr) throw new Error(itemErr.message);
  if (!item) throw new Error("Item de produção não encontrado.");

  const row = item as unknown as SupplyItemQueryRow;
  if (row.is_suggestion) {
    throw new Error("Não é possível abastecer uma sugestão do MRP.");
  }
  if (row.warehouse_supplied_at) {
    throw new Error("Este item já foi abastecido.");
  }

  const poRaw = row.production_order;
  const po = Array.isArray(poRaw) ? poRaw[0] : poRaw;
  if (!po?.id || po.is_suggestion) {
    throw new Error("Ordem de produção inválida.");
  }
  if (po.status === "cancelled") {
    throw new Error("Ordem de produção cancelada.");
  }
  if (po.status === "finished" && !options?.allowFinishedOrder) {
    throw new Error("Ordem de produção já finalizada.");
  }

  const productId = row.product_id;
  if (!productId) throw new Error("Item sem produto associado.");

  const qty = Number(row.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantidade inválida no item de produção.");
  }

  const orderNumber = po.order_number;

  const overrideNeeds = normalizeMaterialOverrides(options?.materials);
  let needs: GrossMaterialNeed[];

  if (overrideNeeds) {
    needs = await filterPhysicalSupplyNeeds(admin, tenantId, overrideNeeds);
  } else {
    const bomNeeds = await calculateNeededMaterialsForProductQty(
      admin,
      tenantId,
      productId,
      qty
    );
    needs = await filterPhysicalSupplyNeeds(admin, tenantId, bomNeeds);
  }

  if (!needs.length) {
    if (!options?.skipIfNoMaterials) {
      throw new Error("Produto sem materiais na BOM para abastecer.");
    }
    const now = new Date().toISOString();
    const { error: markErr } = await admin
      .from("order_items")
      .update({
        warehouse_supplied_at: now,
        warehouse_supplied_by: userId ?? null,
      })
      .eq("id", orderItemId)
      .eq("tenant_id", tenantId)
      .is("warehouse_supplied_at", null);
    if (markErr) throw new Error(markErr.message);
    return {
      order_item_id: orderItemId,
      order_number: orderNumber,
      movements: 0,
      materials: [],
    };
  }

  // Para liberar empenho: baixa nos produtos efectivos + originais substituídos
  const releaseMaterials = new Map<string, number>();
  for (const n of needs) {
    releaseMaterials.set(
      n.product_id,
      (releaseMaterials.get(n.product_id) ?? 0) + n.gross_qty
    );
  }
  if (options?.materials) {
    for (const m of options.materials) {
      const originalId =
        typeof m.original_product_id === "string" ? m.original_product_id : null;
      if (originalId && originalId !== m.product_id) {
        const q = Number(m.quantity);
        if (Number.isFinite(q) && q > 0) {
          releaseMaterials.set(
            originalId,
            (releaseMaterials.get(originalId) ?? 0) + q
          );
        }
      }
    }
  }

  const reason = `Abastecimento OP ${orderNumber}`;

  const empenhoCleanup = await removeLegacyMrpEmpenhoForProductionOrder(
    admin,
    tenantId,
    po.id
  );
  if (empenhoCleanup.error) throw new Error(empenhoCleanup.error);

  for (const need of needs) {
    const outRes = await applyInventoryOutbound(
      admin,
      tenantId,
      need.product_id,
      need.gross_qty,
      {
        reason,
        referenceId: orderItemId,
        origin: PRODUCTION_SUPPLY_ORIGIN,
        userId: userId ?? null,
        allowNegative: true,
      }
    );
    if (outRes.error) {
      throw new Error(outRes.error);
    }
  }

  await releaseProductionSupplyReservations(admin, {
    tenantId,
    orderItemId,
    materials: [...releaseMaterials.entries()].map(
      ([product_id, gross_qty]) => ({ product_id, gross_qty })
    ),
    userId,
  });

  const now = new Date().toISOString();
  const { error: markErr } = await admin
    .from("order_items")
    .update({
      warehouse_supplied_at: now,
      warehouse_supplied_by: userId ?? null,
    })
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .is("warehouse_supplied_at", null);

  if (markErr) throw new Error(markErr.message);

  return {
    order_item_id: orderItemId,
    order_number: orderNumber,
    movements: needs.length,
    materials: needs.map((n) => ({
      product_id: n.product_id,
      quantity: n.gross_qty,
    })),
  };
}

/** Baixa componentes da BOM se o item ainda não foi abastecido (ex.: ao finalizar na linha). */
export async function ensureProductionSupplyForFinish(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  userId?: string | null,
  options?: Pick<ProductionSupplyOptions, "allowFinishedOrder">
): Promise<ApplyProductionSupplyResult | { skipped: true }> {
  const { data: row, error } = await admin
    .from("order_items")
    .select("warehouse_supplied_at")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Item de produção não encontrado.");
  if (row.warehouse_supplied_at) return { skipped: true };

  return applyProductionSupply(admin, tenantId, orderItemId, userId, {
    allowFinishedOrder: options?.allowFinishedOrder,
    skipIfNoMaterials: true,
  });
}
