import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePurchaseNeedDate,
} from "@/modules/compras/lib/purchasing/purchase-schedule-conflicts";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export type MaterialRequirement = {
  product_id: string;
  description: string;
  unit: string;
  needed: number;
  quantity_on_hand: number;
  reserved_quantity: number;
  available: number;
  shortage: number;
};

/** Necessidade bruta por matéria (após explosão da BOM). */
export type GrossMaterialNeed = {
  product_id: string;
  gross_qty: number;
};

/** Pedidos de venda elegíveis para MRP em lote. */
export const MRP_BATCH_ORDER_STATUSES = ["confirmed"] as const;

export type MrpLineResult = {
  sales_order_item_id: string;
  line_number: number;
  product_id: string | null;
  skipped_reason?: string;
  /** Só em modo pré-visualização (confirm=false): necessidades por material. */
  requirements?: MaterialRequirement[];
  purchase_orders: Array<{ id: string; po_number: string; supplier_id: string | null }>;
  production_order_id: string | null;
};

export type MrpProcessResult = {
  sales_order_id: string;
  order_number: string;
  lines: MrpLineResult[];
};

export type MrpBatchSummary = {
  orders: MrpProcessResult[];
  errors: Array<{ sales_order_id: string; message: string }>;
};

export type MrpSuggestionsSummary = {
  generated: MrpBatchSummary;
  suggestion_flags: {
    production_orders_marked: number;
    order_items_marked: number;
    purchase_orders_marked: number;
    purchase_order_items_marked: number;
    sales_orders_reverted: number;
  };
};

export type MrpCommitSummary = {
  production_orders_committed: number;
  order_items_committed: number;
  purchase_orders_committed: number;
  purchase_order_items_committed: number;
};

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Verifica se o produto tem pelo menos uma linha em `product_components` (BOM). */
async function productHasBom(
  admin: Admin,
  tenantId: string,
  productId: string,
  cache: Map<string, boolean>
): Promise<boolean> {
  const hit = cache.get(productId);
  if (hit !== undefined) return hit;

  const { count, error } = await admin
    .from("product_components")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("parent_product_id", productId);

  if (error) throw new Error(error.message);
  const has = (count ?? 0) > 0;
  cache.set(productId, has);
  return has;
}

/**
 * Explosão BOM: componente **com** BOM → desce um nível; **sem** BOM → necessidade de compra.
 * Produto sem BOM na raiz → compra do próprio produto.
 */
async function collectMaterialNeeds(
  admin: Admin,
  tenantId: string,
  productId: string,
  multiplier: number,
  acc: Map<string, number>,
  stack: Set<string>,
  bomCache: Map<string, boolean>
): Promise<void> {
  if (stack.has(productId)) return;
  stack.add(productId);

  const hasBom = await productHasBom(admin, tenantId, productId, bomCache);

  if (!hasBom) {
    const cur = acc.get(productId) ?? 0;
    acc.set(productId, round4(cur + multiplier));
    stack.delete(productId);
    return;
  }

  const { data: lines, error } = await admin
    .from("product_components")
    .select("component_product_id, quantity")
    .eq("tenant_id", tenantId)
    .eq("parent_product_id", productId);

  if (error) throw new Error(error.message);

  for (const row of lines ?? []) {
    if (!row.component_product_id) continue;
    const cid = row.component_product_id;
    const q = Number(row.quantity ?? 0) * multiplier;
    if (!Number.isFinite(q) || q <= 0) continue;

    const childHasBom = await productHasBom(admin, tenantId, cid, bomCache);
    if (childHasBom) {
      await collectMaterialNeeds(admin, tenantId, cid, q, acc, stack, bomCache);
    } else {
      const cur = acc.get(cid) ?? 0;
      acc.set(cid, round4(cur + q));
    }
  }

  stack.delete(productId);
}

/** Necessidade bruta para um único produto acabado × quantidade (explosão BOM). */
export async function calculateNeededMaterialsForProductQty(
  admin: Admin,
  tenantId: string,
  productId: string,
  quantity: number
): Promise<GrossMaterialNeed[]> {
  const qty = Number(quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return [];
  const needs = new Map<string, number>();
  const bomCache = new Map<string, boolean>();
  await collectMaterialNeeds(
    admin,
    tenantId,
    productId,
    qty,
    needs,
    new Set(),
    bomCache
  );
  return [...needs.entries()].map(([product_id, gross_qty]) => ({
    product_id,
    gross_qty: round4(gross_qty),
  }));
}

/** Para cada produto acabado no pedido, percorre a BOM e soma necessidades brutas. */
export async function calculateNeededMaterials(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<GrossMaterialNeed[]> {
  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .select("id")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  if (!so) throw new Error("Pedido de venda não encontrado.");

  const { data: items, error: itErr } = await admin
    .from("sales_order_items")
    .select("product_id, quantity")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (itErr) throw new Error(itErr.message);

  const needs = new Map<string, number>();
  const bomCache = new Map<string, boolean>();
  for (const it of items ?? []) {
    const pid = it.product_id;
    if (!pid) continue;
    const qty = Number(it.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    await collectMaterialNeeds(
      admin,
      tenantId,
      pid,
      qty,
      needs,
      new Set(),
      bomCache
    );
  }

  return [...needs.entries()].map(([product_id, gross_qty]) => ({
    product_id,
    gross_qty: round4(gross_qty),
  }));
}

/**
 * Necessidade líquida para compra/MRP: `needed` (bruto da BOM) menos apenas o stock
 * físico (`quantity_on_hand`). Sem registo em `inventory` ⇒ stock 0.
 * Falta = max(0, needed − quantity_on_hand) — com estoque inicial zero, falta = needed.
 */
export async function getNetRequirements(
  admin: Admin,
  tenantId: string,
  gross: GrossMaterialNeed[]
): Promise<MaterialRequirement[]> {
  if (!gross.length) return [];

  const productIds = [...new Set(gross.map((g) => g.product_id))];
  const needMap = new Map(gross.map((g) => [g.product_id, g.gross_qty]));

  const { data: invRows } = await admin
    .from("inventory")
    .select("product_id, quantity_on_hand, reserved_quantity")
    .eq("tenant_id", tenantId)
    .in("product_id", productIds);

  const invMap = new Map<
    string,
    { quantity_on_hand: number; reserved_quantity: number }
  >();
  for (const r of invRows ?? []) {
    invMap.set(r.product_id, {
      quantity_on_hand: Number(r.quantity_on_hand ?? 0),
      reserved_quantity: Number(r.reserved_quantity ?? 0),
    });
  }

  const { data: prods, error: pErr } = await admin
    .from("products")
    .select("id, name, technical_code, unit")
    .eq("tenant_id", tenantId)
    .in("id", productIds);
  if (pErr) throw new Error(pErr.message);
  const prodById = new Map((prods ?? []).map((p) => [p.id, p]));

  const out: MaterialRequirement[] = [];
  for (const pid of productIds) {
    const neededRaw = needMap.get(pid) ?? 0;
    const needed = round4(neededRaw);
    const inv = invMap.get(pid);
    const quantity_on_hand = inv?.quantity_on_hand ?? 0;
    const reserved_quantity = inv?.reserved_quantity ?? 0;
    const shortage = round4(Math.max(0, needed - quantity_on_hand));
    const available = round4(Math.max(0, quantity_on_hand - reserved_quantity));
    const p = prodById.get(pid);
    out.push({
      product_id: pid,
      description: p ? `${p.technical_code} — ${p.name}` : pid,
      unit: (p?.unit?.trim() || "UN") as string,
      needed,
      quantity_on_hand: round4(quantity_on_hand),
      reserved_quantity: round4(reserved_quantity),
      available,
      shortage,
    });
  }

  out.sort((a, b) => a.description.localeCompare(b.description));
  return out;
}

export async function calculateMaterialRequirements(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<MaterialRequirement[]> {
  const gross = await calculateNeededMaterials(admin, tenantId, salesOrderId);
  return getNetRequirements(admin, tenantId, gross);
}

async function nextMrpPoNumber(admin: Admin, tenantId: string): Promise<string> {
  const prefix = `MRP-${new Date().toISOString().slice(0, 10)}-`;
  const { data } = await admin
    .from("purchase_orders")
    .select("po_number")
    .eq("tenant_id", tenantId)
    .like("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(1);
  const last = data?.[0]?.po_number;
  let n = 1;
  if (last?.startsWith(prefix)) {
    const suf = last.slice(prefix.length);
    const num = parseInt(suf, 10);
    if (Number.isFinite(num)) n = num + 1;
  }
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export type PurchaseOrdersResult = {
  purchase_orders: Array<{ id: string; po_number: string; supplier_id: string | null }>;
};

/** Para cada item com necessidade líquida > 0, cria pedido de compra em rascunho (agrupado por fornecedor). */
export async function generatePurchaseOrders(
  admin: Admin,
  tenantId: string,
  userId: string,
  requirements: MaterialRequirement[]
): Promise<PurchaseOrdersResult> {
  const shortages = requirements.filter((m) => m.shortage > 0.0001);
  if (!shortages.length) return { purchase_orders: [] };

  const { data: suppliers, error: sErr } = await admin
    .from("suppliers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(1);
  if (sErr) throw new Error(sErr.message);
  const fallbackSupplierId = suppliers?.[0]?.id ?? null;
  if (!fallbackSupplierId) {
    throw new Error("Cadastre pelo menos um fornecedor ativo para gerar compras.");
  }

  const productIds = [...new Set(shortages.map((s) => s.product_id))];
  const { data: prefRows, error: pErr } = await admin
    .from("products")
    .select("id, preferred_supplier_id, cost_price, name, unit, technical_code")
    .eq("tenant_id", tenantId)
    .in("id", productIds);
  if (pErr) throw new Error(pErr.message);
  const prefMap = new Map(
    (prefRows ?? []).map((r) => [
      r.id,
      {
        preferred_supplier_id: r.preferred_supplier_id as string | null,
        cost_price: Number(r.cost_price ?? 0),
        name: r.name,
        technical_code: r.technical_code,
        unit: r.unit?.trim() || "UN",
      },
    ])
  );

  const bySupplier = new Map<
    string,
    Array<{
      product_id: string;
      shortage: number;
      unit_price: number;
      unit: string;
      description: string;
    }>
  >();

  for (const m of shortages) {
    const pref = prefMap.get(m.product_id);
    let sid = pref?.preferred_supplier_id ?? null;
    if (sid) {
      const { data: ok } = await admin
        .from("suppliers")
        .select("id")
        .eq("id", sid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!ok) sid = null;
    }
    if (!sid) sid = fallbackSupplierId;
    const unit_price = pref?.cost_price ?? 0;
    const unit = pref?.unit ?? m.unit;
    const description = pref?.name ?? m.description;
    const list = bySupplier.get(sid) ?? [];
    list.push({
      product_id: m.product_id,
      shortage: m.shortage,
      unit_price,
      unit,
      description,
    });
    bySupplier.set(sid, list);
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const purchase_orders: PurchaseOrdersResult["purchase_orders"] = [];

  for (const [supplier_id, lines] of bySupplier) {
    const po_number = await nextMrpPoNumber(admin, tenantId);
    const { data: po, error: poErr } = await admin
      .from("purchase_orders")
      .insert({
        tenant_id: tenantId,
        po_number,
        supplier_id,
        status: "draft",
        requested_by: profile?.id ?? null,
      })
      .select("id, po_number")
      .single();
    if (poErr) throw new Error(poErr.message);

    for (const line of lines) {
      const { error: liErr } = await admin.from("purchase_order_items").insert({
        tenant_id: tenantId,
        purchase_order_id: po.id,
        product_id: line.product_id,
        description: line.description,
        quantity: line.shortage,
        unit: line.unit,
        unit_price: line.unit_price,
      });
      if (liErr) throw new Error(liErr.message);
    }

    purchase_orders.push({
      id: po.id,
      po_number: po.po_number,
      supplier_id,
    });
  }

  return { purchase_orders };
}

function traceSegment(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 48);
}

function padLineNumber(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(3, "0");
}

function opNumberForSalesLine(orderNumber: string, lineNumber: number): string {
  return `${traceSegment(orderNumber)}-${padLineNumber(lineNumber)}`;
}

async function getStockOnHand(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<number> {
  const { data } = await admin
    .from("inventory")
    .select("quantity_on_hand")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();
  return Number(data?.quantity_on_hand ?? 0);
}

function buildTraceKey(
  orderNumber: string,
  lineNumber: number,
  componentTechnicalCode: string
): string {
  return `${traceSegment(orderNumber)}-${lineNumber}-${traceSegment(componentTechnicalCode)}`;
}

/** Mesmo formato de vendas: `{pedido}-{linha}-{componente}` (OP estoque usa order_number da OP). */
export function buildMrpRequisitionTraceKey(
  orderNumber: string,
  lineNumber: number,
  componentTechnicalCode: string
): string {
  return buildTraceKey(orderNumber, lineNumber, componentTechnicalCode);
}

async function followUpDateForSalesOrderItem(
  admin: Admin,
  tenantId: string,
  salesOrderItemId: string,
  hint?: string | null
): Promise<string | null> {
  if (hint) return String(hint).slice(0, 10);
  const { data: soi } = await admin
    .from("sales_order_items")
    .select(
      "pcp_deadline, sales_order:sales_orders!sales_order_items_sales_order_id_fkey(expected_delivery)"
    )
    .eq("id", salesOrderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!soi) return null;
  const so = Array.isArray(soi.sales_order)
    ? soi.sales_order[0]
    : soi.sales_order;
  const d =
    (soi.pcp_deadline ? String(soi.pcp_deadline).slice(0, 10) : null) ??
    (so?.expected_delivery ? String(so.expected_delivery).slice(0, 10) : null);
  return d;
}

async function followUpDateForProductionOrderItem(
  admin: Admin,
  tenantId: string,
  productionOrderItemId: string,
  hint?: string | null
): Promise<string | null> {
  if (hint) return String(hint).slice(0, 10);
  const { data: oi } = await admin
    .from("order_items")
    .select(
      "pcp_deadline, production_order:production_orders!order_items_order_id_fkey(pcp_deadline)"
    )
    .eq("id", productionOrderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!oi) return null;
  const po = Array.isArray(oi.production_order)
    ? oi.production_order[0]
    : oi.production_order;
  const itemPcp = oi.pcp_deadline ? String(oi.pcp_deadline).slice(0, 10) : null;
  const opPcp =
    po?.pcp_deadline != null ? String(po.pcp_deadline).slice(0, 10) : null;
  return itemPcp ?? opPcp;
}

type UpsertPurchaseRequisitionArgs = {
  traceKey: string;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  description: string;
  productionOrderId?: string | null;
  /** order_items.id do produto acabado na OP */
  productionOrderItemId?: string | null;
  salesOrderItemId?: string | null;
  pcpDeadline?: string | null;
};

type UpsertPurchaseRequisitionResult = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  requisition: boolean;
};

async function resolvePreferredSupplierId(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<string | null> {
  const { data: pref } = await admin
    .from("products")
    .select("preferred_supplier_id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!pref?.preferred_supplier_id) return null;
  const { data: ok } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", pref.preferred_supplier_id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  return ok?.id ?? null;
}

/**
 * Requisição de compra (item MRP) — não exige fornecedor; o PC é emitido depois em Compras.
 * Upsert por (`sales_order_item_id`, `product_id`) ou (`production_order_item_id`, `product_id`).
 */
async function upsertPurchaseRequisition(
  admin: Admin,
  tenantId: string,
  args: UpsertPurchaseRequisitionArgs
): Promise<UpsertPurchaseRequisitionResult> {
  const salesOrderItemId = args.salesOrderItemId?.trim() || null;
  const productionOrderItemId = args.productionOrderItemId?.trim() || null;

  if (!salesOrderItemId && !productionOrderItemId) {
    throw new Error(
      "upsertPurchaseRequisition requer salesOrderItemId ou productionOrderItemId"
    );
  }

  const preferredSupplierId = await resolvePreferredSupplierId(
    admin,
    tenantId,
    args.productId
  );

  const { data: productLead } = await admin
    .from("products")
    .select("purchase_lead_time_days")
    .eq("id", args.productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (salesOrderItemId && args.productId) {
    const needDate = computePurchaseNeedDate(
      args.pcpDeadline ??
        (await followUpDateForSalesOrderItem(
          admin,
          tenantId,
          salesOrderItemId
        )),
      productLead?.purchase_lead_time_days
    );

    const { data: existingRows } = await admin
      .from("purchase_order_items")
      .select(
        "id, quantity, unit_price, status, purchase_order_id, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(id, po_number, supplier_id)"
      )
      .eq("tenant_id", tenantId)
      .eq("sales_order_item_id", salesOrderItemId)
      .eq("product_id", args.productId)
      .order("created_at", { ascending: false });

    const draftRequisition = (existingRows ?? []).find(
      (r) => r.purchase_order_id == null && r.status === "draft"
    );
    const linkedPo = (existingRows ?? []).find((r) => r.purchase_order_id != null);

    if (draftRequisition?.id) {
      const newQty = round4(args.quantity);
      const unitPrice = round4(
        Math.max(Number(draftRequisition.unit_price ?? 0), args.unitPrice)
      );

      await admin
        .from("purchase_order_items")
        .update({
          quantity: newQty,
          unit_price: unitPrice,
          total_price: round4(newQty * unitPrice),
          trace_key: args.traceKey,
          production_order_id: args.productionOrderId ?? null,
          production_item_id: args.productionOrderItemId ?? null,
          production_order_item_id: args.productionOrderItemId ?? null,
          need_date: needDate,
        })
        .eq("id", draftRequisition.id)
        .eq("tenant_id", tenantId);

      return {
        id: draftRequisition.id,
        po_number: args.traceKey,
        supplier_id: preferredSupplierId,
        requisition: true,
      };
    }

    if (linkedPo?.id) {
      const po = Array.isArray(linkedPo.purchase_order)
        ? linkedPo.purchase_order[0]
        : linkedPo.purchase_order;
      if (po) {
        return {
          id: po.id,
          po_number: po.po_number,
          supplier_id: po.supplier_id,
          requisition: false,
        };
      }
    }

    const unitPrice = round4(Math.max(0, args.unitPrice));
    const lineTotal = round4(args.quantity * unitPrice);

    const { data: inserted, error: liErr } = await admin
      .from("purchase_order_items")
      .insert({
        tenant_id: tenantId,
        purchase_order_id: null,
        status: "draft",
        product_id: args.productId,
        description: args.description,
        quantity: args.quantity,
        unit: args.unit,
        unit_price: unitPrice,
        total_price: lineTotal,
        production_order_id: args.productionOrderId ?? null,
        production_item_id: args.productionOrderItemId ?? null,
        production_order_item_id: args.productionOrderItemId ?? null,
        sales_order_item_id: salesOrderItemId,
        trace_key: args.traceKey,
        follow_up_date: needDate,
        need_date: needDate,
      })
      .select("id")
      .single();
    if (liErr) throw new Error(liErr.message);

    return {
      id: inserted.id,
      po_number: args.traceKey,
      supplier_id: preferredSupplierId,
      requisition: true,
    };
  }

  if (productionOrderItemId && args.productId) {
    const needDate = computePurchaseNeedDate(
      args.pcpDeadline ??
        (await followUpDateForProductionOrderItem(
          admin,
          tenantId,
          productionOrderItemId
        )),
      productLead?.purchase_lead_time_days
    );

    const { data: existingRows } = await admin
      .from("purchase_order_items")
      .select(
        "id, quantity, unit_price, status, purchase_order_id, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(id, po_number, supplier_id)"
      )
      .eq("tenant_id", tenantId)
      .eq("production_order_item_id", productionOrderItemId)
      .eq("product_id", args.productId)
      .is("purchase_order_id", null)
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    const draftRequisition = (existingRows ?? [])[0];
    const { data: linkedRows } = await admin
      .from("purchase_order_items")
      .select(
        "id, purchase_order_id, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(id, po_number, supplier_id)"
      )
      .eq("tenant_id", tenantId)
      .eq("production_order_item_id", productionOrderItemId)
      .eq("product_id", args.productId)
      .not("purchase_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const linkedPo = linkedRows?.[0];

    if (draftRequisition?.id) {
      const newQty = round4(args.quantity);
      const unitPrice = round4(
        Math.max(Number(draftRequisition.unit_price ?? 0), args.unitPrice)
      );

      await admin
        .from("purchase_order_items")
        .update({
          quantity: newQty,
          unit_price: unitPrice,
          total_price: round4(newQty * unitPrice),
          trace_key: args.traceKey,
          production_order_id: args.productionOrderId ?? null,
          production_item_id: productionOrderItemId,
          production_order_item_id: productionOrderItemId,
          need_date: needDate,
        })
        .eq("id", draftRequisition.id)
        .eq("tenant_id", tenantId);

      return {
        id: draftRequisition.id,
        po_number: args.traceKey,
        supplier_id: preferredSupplierId,
        requisition: true,
      };
    }

    if (linkedPo?.id) {
      const po = Array.isArray(linkedPo.purchase_order)
        ? linkedPo.purchase_order[0]
        : linkedPo.purchase_order;
      if (po) {
        return {
          id: po.id,
          po_number: po.po_number,
          supplier_id: po.supplier_id,
          requisition: false,
        };
      }
    }

    const unitPrice = round4(Math.max(0, args.unitPrice));
    const lineTotal = round4(args.quantity * unitPrice);

    const { data: inserted, error: liErr } = await admin
      .from("purchase_order_items")
      .insert({
        tenant_id: tenantId,
        purchase_order_id: null,
        status: "draft",
        product_id: args.productId,
        description: args.description,
        quantity: args.quantity,
        unit: args.unit,
        unit_price: unitPrice,
        total_price: lineTotal,
        production_order_id: args.productionOrderId ?? null,
        production_item_id: productionOrderItemId,
        production_order_item_id: productionOrderItemId,
        sales_order_item_id: null,
        trace_key: args.traceKey,
        follow_up_date: needDate,
        need_date: needDate,
      })
      .select("id")
      .single();
    if (liErr) throw new Error(liErr.message);

    return {
      id: inserted.id,
      po_number: args.traceKey,
      supplier_id: preferredSupplierId,
      requisition: true,
    };
  }

  throw new Error(
    "upsertPurchaseRequisition requer salesOrderItemId ou productionOrderItemId"
  );
}

export type ProcessMrpForSalesOrderOptions = {
  /** Se false e `confirm`, cria só a OP e o item de produção (sem PCs por rastreio). */
  createTracePurchaseOrders?: boolean;
};

/**
 * MRP por linha de venda: gera PCs com rastreio e uma OP por linha (produto acabado).
 * Não bloqueia por falta de stock — cria PCs em rascunho e a OP na mesma sequência.
 */
export async function processMrpForSalesOrder(
  admin: Admin,
  tenantId: string,
  userId: string,
  salesOrderId: string,
  confirm: boolean,
  options?: ProcessMrpForSalesOrderOptions
): Promise<MrpProcessResult> {
  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, client_name, client_document, expected_delivery, pcp_deadline, status, order_date"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  if (!so) throw new Error("Pedido não encontrado.");

  const { data: lines, error: liErr } = await admin
    .from("sales_order_items")
    .select(
      "id, line_number, product_id, quantity, description, unit, production_order_id, pcp_deadline"
    )
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId)
    .order("line_number", { ascending: true });
  if (liErr) throw new Error(liErr.message);

  const lineRows = lines ?? [];
  const productIds = [
    ...new Set(
      lineRows
        .map((r) => r.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const prodById = new Map<
    string,
    {
      id: string;
      type: string;
      technical_code: string;
      name: string;
      product_nature: string | null;
      has_composition: boolean;
      default_production_line_id: string | null;
    }
  >();
  if (productIds.length) {
    const { data: prodRows, error: prErr } = await admin
      .from("products")
      .select(
        "id, type, technical_code, name, product_nature, has_composition, default_production_line_id"
      )
      .eq("tenant_id", tenantId)
      .in("id", productIds);
    if (prErr) throw new Error(prErr.message);
    for (const p of prodRows ?? []) {
      prodById.set(p.id, {
        id: p.id,
        type: p.type,
        technical_code: p.technical_code,
        name: p.name,
        product_nature: p.product_nature ?? null,
        has_composition: Boolean(p.has_composition),
        default_production_line_id: p.default_production_line_id ?? null,
      });
    }
  }

  const results: MrpLineResult[] = [];
  const bomCache = new Map<string, boolean>();
  const orderNumber = String(so.order_number ?? "");
  const orderPcpDate =
    so.pcp_deadline != null
      ? String(so.pcp_deadline).slice(0, 10)
      : so.expected_delivery != null
        ? String(so.expected_delivery).slice(0, 10)
        : null;
  const deliveryDate =
    so.expected_delivery != null
      ? String(so.expected_delivery).slice(0, 10)
      : null;

  for (const row of lineRows) {
    const lineRes: MrpLineResult = {
      sales_order_item_id: row.id,
      line_number: Number(row.line_number ?? 0),
      product_id: row.product_id,
      purchase_orders: [],
      production_order_id: null,
    };

    if (!row.product_id) {
      lineRes.skipped_reason = "Linha sem produto.";
      results.push(lineRes);
      continue;
    }

    const p = row.product_id ? prodById.get(row.product_id) : undefined;
    if (!p) {
      lineRes.skipped_reason = "Produto não encontrado.";
      results.push(lineRes);
      continue;
    }

    const qty = Number(row.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      lineRes.skipped_reason = "Quantidade inválida.";
      results.push(lineRes);
      continue;
    }

    const hasBom = await productHasBom(
      admin,
      tenantId,
      row.product_id,
      bomCache
    );

    const linePcpDate =
      row.pcp_deadline != null
        ? String(row.pcp_deadline).slice(0, 10)
        : orderPcpDate;
    const pcpDate = linePcpDate;

    if (!hasBom) {
      const grossNoBom: GrossMaterialNeed[] = [
        { product_id: row.product_id, gross_qty: qty },
      ];
      const requirements = await getNetRequirements(
        admin,
        tenantId,
        grossNoBom
      );
      lineRes.requirements = requirements;

      if (!confirm) {
        results.push(lineRes);
        continue;
      }

      const shortages = requirements.filter((m) => m.shortage > 0.0001);
      const createTracePOs = options?.createTracePurchaseOrders !== false;

      if (createTracePOs && shortages.length > 0) {
        const traceKey = buildTraceKey(
          orderNumber,
          lineRes.line_number,
          p.technical_code
        );
        const { data: priceRow } = await admin
          .from("products")
          .select("cost_price, default_labor_cost, name, unit")
          .eq("id", row.product_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const unitPrice = Number(
          priceRow?.default_labor_cost ?? priceRow?.cost_price ?? 0
        );
        try {
          const req = await upsertPurchaseRequisition(admin, tenantId, {
            traceKey,
            productId: row.product_id,
            quantity: shortages[0]!.shortage,
            unit: shortages[0]!.unit,
            unitPrice,
            description: priceRow?.name ?? row.description ?? p.name,
            salesOrderItemId: row.id,
            pcpDeadline: pcpDate,
          });
          lineRes.purchase_orders.push(req);
          lineRes.skipped_reason = "Produto sem BOM — requisição de compra.";
        } catch (reqErr) {
          const msg =
            reqErr instanceof Error ? reqErr.message : "Erro na requisição";
          lineRes.skipped_reason = msg;
        }
      } else if (shortages.length === 0) {
        lineRes.skipped_reason = "Produto sem BOM — sem falta de stock.";
      }

      results.push(lineRes);
      continue;
    }

    const gross = await calculateNeededMaterialsForProductQty(
      admin,
      tenantId,
      row.product_id,
      qty
    );
    const requirements = await getNetRequirements(admin, tenantId, gross);
    lineRes.requirements = requirements;

    if (!confirm) {
      results.push(lineRes);
      continue;
    }

    const shortages = requirements.filter((m) => m.shortage > 0.0001);

    const stockOnHand = await getStockOnHand(admin, tenantId, row.product_id);
    if (!row.production_order_id && stockOnHand >= qty - 0.0001) {
      const { error: pickErr } = await admin.from("picking_suggestions").insert({
        tenant_id: tenantId,
        sales_order_id: salesOrderId,
        product_id: row.product_id,
        quantity: qty,
        status: "pending",
      });
      if (pickErr) throw new Error(pickErr.message);
      lineRes.skipped_reason = "Stock disponível — sugestão de separação criada.";
      results.push(lineRes);
      continue;
    }

    const opNumber = opNumberForSalesLine(orderNumber, lineRes.line_number);
    const defaultLineId = p.default_production_line_id ?? null;

    let productionOrderId = row.production_order_id as string | null;
    let productionItemId: string | null = null;
    let opWasExisting = Boolean(row.production_order_id);

    if (productionOrderId) {
      const { data: oiExisting } = await admin
        .from("order_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("order_id", productionOrderId)
        .eq("sales_order_item_id", row.id)
        .maybeSingle();
      productionItemId = oiExisting?.id ?? null;
    } else {
      const { data: existingOp } = await admin
        .from("production_orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("order_number", opNumber)
        .maybeSingle();
      if (existingOp?.id) {
        productionOrderId = existingOp.id;
        opWasExisting = true;
        await admin
          .from("sales_order_items")
          .update({ production_order_id: existingOp.id })
          .eq("id", row.id)
          .eq("tenant_id", tenantId);
        lineRes.skipped_reason =
          "OP com este número já existia; vinculada à linha.";
      }
    }

    if (!productionOrderId) {
      const { data: poRow, error: poErr } = await admin
        .from("production_orders")
        .insert({
          tenant_id: tenantId,
          order_number: opNumber,
          client_name: so.client_name,
          client_document: so.client_document,
          delivery_deadline: deliveryDate,
          pcp_deadline: pcpDate,
          status: "planning",
          description: `Pedido ${orderNumber} · linha ${lineRes.line_number}`,
          created_by: userId,
        })
        .select("id")
        .single();
      if (poErr) throw new Error(poErr.message);
      productionOrderId = poRow.id;
      opWasExisting = false;
    }

    if (!productionItemId && productionOrderId) {
      const { data: oiExisting } = await admin
        .from("order_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("order_id", productionOrderId)
        .eq("sales_order_item_id", row.id)
        .maybeSingle();
      productionItemId = oiExisting?.id ?? null;
    }

    if (!productionItemId && productionOrderId) {
      const { data: oiRow, error: oiErr } = await admin
        .from("order_items")
        .insert({
          tenant_id: tenantId,
          order_id: productionOrderId,
          item_number: 1,
          description: row.description || p.name || "Item",
          quantity: qty,
          unit: row.unit?.trim() || "UN",
          product_id: row.product_id,
          status: "waiting",
          pcp_deadline: pcpDate,
          sales_order_item_id: row.id,
          line_id: defaultLineId,
        })
        .select("id")
        .single();
      if (oiErr) throw new Error(oiErr.message);
      productionItemId = oiRow.id;
    }

    const matIds = [...new Set(shortages.map((s) => s.product_id))];
    let matProds: {
      id: string;
      technical_code: string;
      cost_price: number | null;
      default_labor_cost: number | null;
      name: string;
      unit: string | null;
    }[] = [];
    if (matIds.length) {
      const { data: mpRows, error: mpErr } = await admin
        .from("products")
        .select("id, technical_code, cost_price, default_labor_cost, name, unit")
        .eq("tenant_id", tenantId)
        .in("id", matIds);
      if (mpErr) throw new Error(mpErr.message);
      matProds = (mpRows ?? []) as typeof matProds;
    }
    const matMap = new Map(matProds.map((m) => [m.id, m]));

    const createTracePOs = options?.createTracePurchaseOrders !== false;
    if (
      createTracePOs &&
      shortages.length > 0 &&
      productionOrderId &&
      productionItemId
    ) {
      for (const m of shortages) {
        try {
          const mp = matMap.get(m.product_id);
          const code = mp?.technical_code ?? m.product_id.slice(0, 8);
          const traceKey = buildTraceKey(orderNumber, lineRes.line_number, code);
          const unitPrice = mp
            ? Number(mp.default_labor_cost ?? mp.cost_price ?? 0)
            : 0;
          const req = await upsertPurchaseRequisition(admin, tenantId, {
            traceKey,
            productId: m.product_id,
            quantity: m.shortage,
            unit: m.unit,
            unitPrice,
            description: mp?.name ?? m.description,
            productionOrderId,
            productionOrderItemId: productionItemId,
            salesOrderItemId: row.id,
            pcpDeadline: pcpDate,
          });
          lineRes.purchase_orders.push(req);
        } catch (reqErr) {
          const msg =
            reqErr instanceof Error ? reqErr.message : "Erro na requisição";
          lineRes.skipped_reason = lineRes.skipped_reason
            ? `${lineRes.skipped_reason}; ${msg}`
            : msg;
        }
      }
      if (opWasExisting && !lineRes.skipped_reason) {
        lineRes.skipped_reason =
          shortages.length > 0
            ? "OP existente — requisições de compra actualizadas."
            : undefined;
      }
    } else if (shortages.length === 0 && opWasExisting) {
      lineRes.skipped_reason =
        lineRes.skipped_reason ?? "OP existente — sem falta de material.";
    }

    if (productionOrderId && !row.production_order_id) {
      const { error: linkErr } = await admin
        .from("sales_order_items")
        .update({ production_order_id: productionOrderId })
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (linkErr) throw new Error(linkErr.message);
    }

    lineRes.production_order_id = productionOrderId;
    results.push(lineRes);
  }

  if (confirm) {
    const progressed = results.some(
      (r) =>
        r.production_order_id != null ||
        (r.purchase_orders?.length ?? 0) > 0 ||
        r.skipped_reason === "Stock disponível — sugestão de separação criada."
    );
    if (progressed) {
      await admin
        .from("sales_orders")
        .update({ mrp_processed: true })
        .eq("id", salesOrderId)
        .eq("tenant_id", tenantId);
    }
    const hasNewOp = results.some(
      (r) =>
        r.production_order_id != null &&
        r.skipped_reason !== "Já possui ordem de produção."
    );
    if (hasNewOp && so.status === "confirmed") {
      await admin
        .from("sales_orders")
        .update({ status: "in_production" })
        .eq("id", salesOrderId)
        .eq("tenant_id", tenantId)
        .eq("status", "confirmed");
    }
  }

  return {
    sales_order_id: salesOrderId,
    order_number: orderNumber,
    lines: results,
  };
}

/** MRP em lote: pedidos confirmados ainda não processados pelo MRP. */
export async function processMrpForPendingOrders(
  admin: Admin,
  tenantId: string,
  userId: string,
  confirm: boolean
): Promise<MrpBatchSummary> {
  return runMrpForOpenSalesOrders(admin, tenantId, userId, confirm);
}

/** Reprocessa MRP de um pedido (redefine flag e executa de novo). */
export async function regenerateMrpForOrder(
  admin: Admin,
  tenantId: string,
  userId: string,
  salesOrderId: string
): Promise<MrpProcessResult> {
  await admin
    .from("sales_orders")
    .update({ mrp_processed: false })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);
  return processMrpForSalesOrder(admin, tenantId, userId, salesOrderId, true);
}

/** MRP em lote: todos os pedidos confirmados com linhas pendentes. */
export async function runMrpForOpenSalesOrders(
  admin: Admin,
  tenantId: string,
  userId: string,
  confirm: boolean
): Promise<MrpBatchSummary> {
  const statuses = [...MRP_BATCH_ORDER_STATUSES];
  let orderQuery = admin
    .from("sales_orders")
    .select("id, order_number")
    .eq("tenant_id", tenantId)
    .in("status", statuses)
    .order("order_date", { ascending: true });

  if (!confirm) {
    orderQuery = orderQuery.eq("mrp_processed", false);
  }

  const { data: orders, error } = await orderQuery;
  if (error) throw new Error(error.message);

  const out: MrpProcessResult[] = [];
  const errors: MrpBatchSummary["errors"] = [];

  for (const o of orders ?? []) {
    try {
      const r = await processMrpForSalesOrder(
        admin,
        tenantId,
        userId,
        o.id,
        confirm
      );
      const worthShowing = r.lines.some(
        (l) =>
          l.production_order_id != null ||
          (l.purchase_orders?.length ?? 0) > 0 ||
          (l.requirements?.some((req) => req.shortage > 0.0001) ?? false) ||
          (l.skipped_reason != null &&
            l.skipped_reason !== "Já possui ordem de produção.")
      );
      if (worthShowing) {
        out.push(r);
      }
    } catch (e) {
      errors.push({
        sales_order_id: o.id,
        message: e instanceof Error ? e.message : "Erro",
      });
    }
  }

  return { orders: out, errors };
}

/**
 * Etapa A (S1): Gera sugestões persistidas (is_suggestion=true) usando o motor existente.
 *
 * Observação: esta função executa o MRP real por pedido e, em seguida,
 * marca apenas os registros recém-criados como sugestão e reverte flags do pedido.
 * Isso garante que nada “vaze” como real antes da ação explícita de efetivar.
 */
export async function generateMrpSuggestionsForPendingOrders(
  admin: Admin,
  tenantId: string,
  userId: string
): Promise<MrpSuggestionsSummary> {
  const startedAt = new Date();
  const startedIso = startedAt.toISOString();

  const batch = await runMrpForOpenSalesOrders(admin, tenantId, userId, true);

  // Reverter flags do pedido de venda (o MRP real marca como processado / muda status).
  const salesOrderIds = [
    ...new Set(batch.orders.map((o) => o.sales_order_id).filter(Boolean)),
  ];
  if (salesOrderIds.length) {
    await admin
      .from("sales_orders")
      .update({ mrp_processed: false, status: "confirmed" })
      .eq("tenant_id", tenantId)
      .in("id", salesOrderIds);
  }

  // IDs retornados: para requisitions (purchase_order_items) e PCs por rastreio (purchase_orders).
  const productionOrderIds = new Set<string>();
  const purchaseOrderIds = new Set<string>();
  const purchaseOrderItemIds = new Set<string>();

  for (const ord of batch.orders) {
    for (const line of ord.lines) {
      if (line.production_order_id) productionOrderIds.add(line.production_order_id);
      for (const po of line.purchase_orders ?? []) {
        if (!po?.id) continue;
        // Heurística: se o id existir em purchase_orders, marcamos como PO; caso contrário, como item.
        // (As requisições MRP são purchase_order_items sem purchase_order_id.)
        purchaseOrderIds.add(po.id);
        purchaseOrderItemIds.add(po.id);
      }
    }
  }

  let production_orders_marked = 0;
  let order_items_marked = 0;
  let purchase_orders_marked = 0;
  let purchase_order_items_marked = 0;

  // Marcar OPs recém-criadas por este usuário como sugestão.
  if (productionOrderIds.size) {
    const ids = [...productionOrderIds];
    const { data: ops } = await admin
      .from("production_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .eq("created_by", userId)
      .gte("created_at", startedIso);

    const opIds = (ops ?? []).map((o) => o.id);
    if (opIds.length) {
      const { data: updOps } = await admin
        .from("production_orders")
        .update({ is_suggestion: true, source_kind: "mrp_suggestion" })
        .eq("tenant_id", tenantId)
        .in("id", opIds)
        .select("id");
      production_orders_marked = (updOps ?? []).length;

      const { data: updItems } = await admin
        .from("order_items")
        .update({ is_suggestion: true })
        .eq("tenant_id", tenantId)
        .in("order_id", opIds)
        .select("id");
      order_items_marked = (updItems ?? []).length;
    }
  }

  // Marcar PCs (purchase_orders) recém-criados pelo MRP como sugestão.
  if (purchaseOrderIds.size) {
    const ids = [...purchaseOrderIds];
    const { data: pos } = await admin
      .from("purchase_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .gte("created_at", startedIso);

    const poIds = (pos ?? []).map((p) => p.id);
    if (poIds.length) {
      const { data: updPo } = await admin
        .from("purchase_orders")
        .update({ is_suggestion: true })
        .eq("tenant_id", tenantId)
        .in("id", poIds)
        .select("id");
      purchase_orders_marked = (updPo ?? []).length;

      const { data: updPoItems } = await admin
        .from("purchase_order_items")
        .update({ is_suggestion: true })
        .eq("tenant_id", tenantId)
        .in("purchase_order_id", poIds)
        .select("id");
      purchase_order_items_marked += (updPoItems ?? []).length;
    }
  }

  // Marcar requisições MRP (purchase_order_items sem purchase_order_id) recém-criadas.
  if (purchaseOrderItemIds.size) {
    const ids = [...purchaseOrderItemIds];
    const { data: updReq } = await admin
      .from("purchase_order_items")
      .update({ is_suggestion: true })
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .is("purchase_order_id", null)
      .gte("created_at", startedIso)
      .select("id");
    purchase_order_items_marked += (updReq ?? []).length;
  }

  return {
    generated: batch,
    suggestion_flags: {
      production_orders_marked,
      order_items_marked,
      purchase_orders_marked,
      purchase_order_items_marked,
      sales_orders_reverted: salesOrderIds.length,
    },
  };
}

/** Efetiva sugestões existentes no tenant (is_suggestion=true → false). */
export async function commitMrpSuggestionsForTenant(
  admin: Admin,
  tenantId: string
): Promise<MrpCommitSummary> {
  const { data: ops } = await admin
    .from("production_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", true);
  const opIds = (ops ?? []).map((o) => o.id);

  const { data: pos } = await admin
    .from("purchase_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", true);
  const poIds = (pos ?? []).map((p) => p.id);

  const { data: updOps } = await admin
    .from("production_orders")
    .update({ is_suggestion: false })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", true)
    .select("id");

  const { data: updOi } = opIds.length
    ? await admin
        .from("order_items")
        .update({ is_suggestion: false })
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", true)
        .in("order_id", opIds)
        .select("id")
    : { data: [] as Array<{ id: string }> };

  const { data: updPo } = await admin
    .from("purchase_orders")
    .update({ is_suggestion: false })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", true)
    .select("id");

  const { data: updPoiByPo } = poIds.length
    ? await admin
        .from("purchase_order_items")
        .update({ is_suggestion: false })
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", true)
        .in("purchase_order_id", poIds)
        .select("id")
    : { data: [] as Array<{ id: string }> };

  const { data: updReq } = await admin
    .from("purchase_order_items")
    .update({ is_suggestion: false })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", true)
    .is("purchase_order_id", null)
    .select("id");

  return {
    production_orders_committed: (updOps ?? []).length,
    order_items_committed: (updOi ?? []).length,
    purchase_orders_committed: (updPo ?? []).length,
    purchase_order_items_committed:
      (updPoiByPo ?? []).length + (updReq ?? []).length,
  };
}

/** Legado: uma OP para o pedido inteiro (evitar uso; preferir MRP por linha). */
export async function createProductionOrderIfFeasible(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  userId: string
): Promise<{ production_order_id: string }> {
  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, client_name, client_document, expected_delivery, production_order_id, status"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  if (!so) throw new Error("Pedido não encontrado.");
  if (so.production_order_id) {
    throw new Error("Este pedido já tem ordem de produção associada (cabeçalho).");
  }

  const { data: pending } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId)
    .is("production_order_id", null)
    .limit(1);
  if ((pending?.length ?? 0) > 0) {
    throw new Error(
      "Use o MRP por linha: existem linhas de venda sem ordem de produção. Execute o MRP no pedido ou em lote."
    );
  }

  const reqs = await calculateMaterialRequirements(
    admin,
    tenantId,
    salesOrderId
  );
  const blocked = reqs.filter((r) => r.shortage > 0.0001);
  if (blocked.length) {
    throw new Error(
      "Ainda há falta de material em estoque. Gere compras ou ajuste o inventário antes de criar a OP."
    );
  }

  const opNumber = `OP-${so.order_number}-${Date.now().toString(36).toUpperCase()}`;

  const { data: poRow, error: poErr } = await admin
    .from("production_orders")
    .insert({
      tenant_id: tenantId,
      order_number: opNumber,
      client_name: so.client_name,
      client_document: so.client_document,
      delivery_deadline: so.expected_delivery,
      status: "planning",
      description: `Gerado automaticamente a partir do pedido ${so.order_number}`,
      created_by: userId,
    })
    .select("id")
    .single();
  if (poErr) throw new Error(poErr.message);

  const { data: items, error: itErr } = await admin
    .from("sales_order_items")
    .select("product_id, quantity, description, unit")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (itErr) throw new Error(itErr.message);

  let itemNum = 1;
  for (const it of items ?? []) {
    if (!it.product_id) continue;
    const qty = Number(it.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const { error: oiErr } = await admin.from("order_items").insert({
      tenant_id: tenantId,
      order_id: poRow.id,
      item_number: itemNum++,
      description: it.description || "Item",
      quantity: qty,
      unit: it.unit?.trim() || "UN",
      product_id: it.product_id,
      status: "waiting",
    });
    if (oiErr) throw new Error(oiErr.message);
  }

  const { error: upErr } = await admin
    .from("sales_orders")
    .update({
      production_order_id: poRow.id,
      status: "in_production",
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (upErr) throw new Error(upErr.message);

  return { production_order_id: poRow.id };
}
