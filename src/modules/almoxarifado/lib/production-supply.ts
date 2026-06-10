import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { applyInventoryOutbound } from "@/modules/almoxarifado/lib/inventory-outbound";
import { INVENTORY_ORIGIN } from "@/modules/almoxarifado/lib/inventory-origins";
import { removeLegacyMrpEmpenhoForProductionOrder } from "@/modules/almoxarifado/lib/legacy-mrp-empenho";
import {
  calculateNeededMaterialsForProductQty,
  type GrossMaterialNeed,
} from "@/modules/pcp/lib/mrp-service";

type Admin = SupabaseClient<Database>;

type ProductPrefixRow = {
  id: string;
  prefix:
    | { code: string | null }
    | { code: string | null }[]
    | null;
};

/** Remove mão-de-obra (prefixo MO) — não há baixa física em estoque. */
async function filterPhysicalSupplyNeeds(
  admin: Admin,
  tenantId: string,
  needs: GrossMaterialNeed[]
): Promise<GrossMaterialNeed[]> {
  if (!needs.length) return [];

  const ids = [...new Set(needs.map((n) => n.product_id))];
  const { data: products, error } = await admin
    .from("products")
    .select("id, prefix:product_prefixes!products_prefix_id_fkey(code)")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (error) throw new Error(error.message);

  const laborIds = new Set<string>();
  for (const raw of (products ?? []) as unknown as ProductPrefixRow[]) {
    const prefix = Array.isArray(raw.prefix) ? raw.prefix[0] : raw.prefix;
    if (prefix?.code === "MO") laborIds.add(raw.id);
  }

  return needs.filter((n) => !laborIds.has(n.product_id));
}

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

export type ProductionSupplyOptions = {
  /** Permite abastecer OP já fechada (correcção / backfill). */
  allowFinishedOrder?: boolean;
  /** Sem BOM: marca abastecido sem movimentos em vez de erro. */
  skipIfNoMaterials?: boolean;
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

  const bomNeeds = await calculateNeededMaterialsForProductQty(
    admin,
    tenantId,
    productId,
    qty
  );
  const needs = await filterPhysicalSupplyNeeds(admin, tenantId, bomNeeds);
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
