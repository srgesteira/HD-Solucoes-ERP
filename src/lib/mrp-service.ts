import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  mrSalesLineEligibleForProductionOrder,
  mrShouldExpandBomInExplosion,
  type MrpProductNatureMeta,
} from "@/lib/products/mrp-product-nature";

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

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

async function fetchMrpProductMeta(
  admin: Admin,
  tenantId: string,
  productId: string,
  cache: Map<string, MrpProductNatureMeta>
): Promise<MrpProductNatureMeta> {
  const hit = cache.get(productId);
  if (hit) return hit;
  const { data, error } = await admin
    .from("products")
    .select("product_nature, has_composition, type")
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const meta: MrpProductNatureMeta = {
    product_nature: (data?.product_nature as string | null) ?? null,
    has_composition: Boolean(data?.has_composition),
    type: (data?.type ?? "component") as MrpProductNatureMeta["type"],
  };
  cache.set(productId, meta);
  return meta;
}

/** Acumula necessidade de materiais (sem mão-de-obra) a partir da BOM, recursivo. */
async function collectMaterialNeeds(
  admin: Admin,
  tenantId: string,
  productId: string,
  multiplier: number,
  acc: Map<string, number>,
  stack: Set<string>,
  metaCache: Map<string, MrpProductNatureMeta>
): Promise<void> {
  if (stack.has(productId)) return;
  stack.add(productId);

  const meta = await fetchMrpProductMeta(admin, tenantId, productId, metaCache);
  if (!mrShouldExpandBomInExplosion(meta)) {
    const cur = acc.get(productId) ?? 0;
    acc.set(productId, cur + multiplier);
    stack.delete(productId);
    return;
  }

  const { data: lines, error } = await admin
    .from("product_components")
    .select("component_product_id, quantity, is_labor")
    .eq("tenant_id", tenantId)
    .eq("parent_product_id", productId);

  if (error) throw new Error(error.message);

  const rows = lines ?? [];
  const materials = rows.filter((r) => !r.is_labor && r.component_product_id);

  if (!rows.length) {
    const cur = acc.get(productId) ?? 0;
    acc.set(productId, cur + multiplier);
    stack.delete(productId);
    return;
  }

  if (!materials.length) {
    stack.delete(productId);
    return;
  }

  for (const row of materials) {
    const cid = row.component_product_id as string;
    const q = Number(row.quantity ?? 0) * multiplier;
    await collectMaterialNeeds(admin, tenantId, cid, q, acc, stack, metaCache);
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
  const metaCache = new Map<string, MrpProductNatureMeta>();
  await collectMaterialNeeds(
    admin,
    tenantId,
    productId,
    qty,
    needs,
    new Set(),
    metaCache
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
  const metaCache = new Map<string, MrpProductNatureMeta>();
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
      metaCache
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

function buildTraceKey(
  orderNumber: string,
  lineNumber: number,
  componentTechnicalCode: string
): string {
  return `${traceSegment(orderNumber)}-${lineNumber}-${traceSegment(componentTechnicalCode)}`;
}

/** Um PC em rascunho por falta, com `po_number` = `trace_key` (rastreio). */
async function createTracePurchaseOrder(
  admin: Admin,
  tenantId: string,
  userId: string,
  args: {
    traceKey: string;
    productId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    description: string;
    productionOrderId: string;
    productionItemId: string;
  }
): Promise<{ id: string; po_number: string; supplier_id: string | null }> {
  const { data: existing } = await admin
    .from("purchase_orders")
    .select("id, po_number")
    .eq("tenant_id", tenantId)
    .eq("po_number", args.traceKey)
    .maybeSingle();
  if (existing?.id) {
    return {
      id: existing.id,
      po_number: existing.po_number,
      supplier_id: null,
    };
  }

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

  let sid: string | null = null;
  const { data: pref } = await admin
    .from("products")
    .select("preferred_supplier_id")
    .eq("id", args.productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (pref?.preferred_supplier_id) {
    const { data: ok } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", pref.preferred_supplier_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (ok) sid = pref.preferred_supplier_id;
  }
  if (!sid) sid = fallbackSupplierId;

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const { data: po, error: poErr } = await admin
    .from("purchase_orders")
    .insert({
      tenant_id: tenantId,
      po_number: args.traceKey,
      supplier_id: sid,
      status: "draft",
      requested_by: profile?.id ?? null,
    })
    .select("id, po_number, supplier_id")
    .single();
  if (poErr) throw new Error(poErr.message);

  const { error: liErr } = await admin.from("purchase_order_items").insert({
    tenant_id: tenantId,
    purchase_order_id: po.id,
    product_id: args.productId,
    description: args.description,
    quantity: args.quantity,
    unit: args.unit,
    unit_price: args.unitPrice,
    production_order_id: args.productionOrderId,
    production_item_id: args.productionItemId,
    trace_key: args.traceKey,
  });
  if (liErr) throw new Error(liErr.message);

  return {
    id: po.id,
    po_number: po.po_number,
    supplier_id: po.supplier_id,
  };
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
      "id, line_number, product_id, quantity, description, unit, production_order_id"
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
    }
  >();
  if (productIds.length) {
    const { data: prodRows, error: prErr } = await admin
      .from("products")
      .select("id, type, technical_code, name, product_nature, has_composition")
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
      });
    }
  }

  const results: MrpLineResult[] = [];
  const orderNumber = String(so.order_number ?? "");
  const pcpDate =
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

    if (row.production_order_id) {
      lineRes.skipped_reason = "Já possui ordem de produção.";
      lineRes.production_order_id = row.production_order_id as string;
      results.push(lineRes);
      continue;
    }
    if (!row.product_id) {
      lineRes.skipped_reason = "Linha sem produto.";
      results.push(lineRes);
      continue;
    }

    const p = row.product_id ? prodById.get(row.product_id) : undefined;
    const meta: MrpProductNatureMeta | null = p
      ? {
          product_nature: p.product_nature,
          has_composition: p.has_composition,
          type: p.type as MrpProductNatureMeta["type"],
        }
      : null;
    if (!p || !meta || !mrSalesLineEligibleForProductionOrder(meta)) {
      lineRes.skipped_reason =
        "Natureza do produto não exige ordem de produção (use compra / MRP de materiais).";
      results.push(lineRes);
      continue;
    }

    const qty = Number(row.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      lineRes.skipped_reason = "Quantidade inválida.";
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

    const opNumber = `${traceSegment(orderNumber)}-${lineRes.line_number}`;

    const { data: existingOp } = await admin
      .from("production_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("order_number", opNumber)
      .maybeSingle();
    if (existingOp?.id) {
      await admin
        .from("sales_order_items")
        .update({ production_order_id: existingOp.id })
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      lineRes.production_order_id = existingOp.id;
      lineRes.skipped_reason =
        "OP com este número já existia; vinculada à linha.";
      results.push(lineRes);
      continue;
    }

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

    const { data: oiRow, error: oiErr } = await admin
      .from("order_items")
      .insert({
        tenant_id: tenantId,
        order_id: poRow.id,
        item_number: 1,
        description: row.description || p.name || "Item",
        quantity: qty,
        unit: row.unit?.trim() || "UN",
        product_id: row.product_id,
        status: "waiting",
        pcp_deadline: pcpDate,
        sales_order_item_id: row.id,
      })
      .select("id")
      .single();
    if (oiErr) throw new Error(oiErr.message);

    const shortages = requirements.filter((m) => m.shortage > 0.0001);
    const matIds = [...new Set(shortages.map((s) => s.product_id))];
    let matProds: {
      id: string;
      technical_code: string;
      cost_price: number | null;
      name: string;
      unit: string | null;
    }[] = [];
    if (matIds.length) {
      const { data: mpRows, error: mpErr } = await admin
        .from("products")
        .select("id, technical_code, cost_price, name, unit")
        .eq("tenant_id", tenantId)
        .in("id", matIds);
      if (mpErr) throw new Error(mpErr.message);
      matProds = (mpRows ?? []) as typeof matProds;
    }

    const matMap = new Map(matProds.map((m) => [m.id, m]));

    const createTracePOs = options?.createTracePurchaseOrders !== false;
    if (createTracePOs) {
      for (const m of shortages) {
        const mp = matMap.get(m.product_id);
        const code = mp?.technical_code ?? m.product_id.slice(0, 8);
        const traceKey = buildTraceKey(orderNumber, lineRes.line_number, code);
        const po = await createTracePurchaseOrder(admin, tenantId, userId, {
          traceKey,
          productId: m.product_id,
          quantity: m.shortage,
          unit: m.unit,
          unitPrice: mp ? Number(mp.cost_price ?? 0) : 0,
          description: mp?.name ?? m.description,
          productionOrderId: poRow.id,
          productionItemId: oiRow.id,
        });
        lineRes.purchase_orders.push(po);
      }
    }

    const { error: linkErr } = await admin
      .from("sales_order_items")
      .update({ production_order_id: poRow.id })
      .eq("id", row.id)
      .eq("tenant_id", tenantId);
    if (linkErr) throw new Error(linkErr.message);

    lineRes.production_order_id = poRow.id;
    results.push(lineRes);
  }

  if (confirm) {
    const progressed = results.some(
      (r) =>
        r.production_order_id != null &&
        r.skipped_reason !== "Já possui ordem de produção."
    );
    if (progressed && so.status === "confirmed") {
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

/** MRP em lote: todos os pedidos confirmados com linhas pendentes. */
export async function runMrpForOpenSalesOrders(
  admin: Admin,
  tenantId: string,
  userId: string,
  confirm: boolean
): Promise<MrpBatchSummary> {
  const statuses = [...MRP_BATCH_ORDER_STATUSES];
  const { data: orders, error } = await admin
    .from("sales_orders")
    .select("id, order_number")
    .eq("tenant_id", tenantId)
    .in("status", statuses)
    .order("order_date", { ascending: true });
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
        (l) => l.skipped_reason !== "Já possui ordem de produção."
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
