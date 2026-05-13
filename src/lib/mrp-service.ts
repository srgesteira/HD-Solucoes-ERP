import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

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

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Acumula necessidade de materiais (sem mão-de-obra) a partir da BOM, recursivo. */
async function collectMaterialNeeds(
  admin: Admin,
  tenantId: string,
  productId: string,
  multiplier: number,
  acc: Map<string, number>,
  stack: Set<string>
): Promise<void> {
  if (stack.has(productId)) return;
  stack.add(productId);

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
    await collectMaterialNeeds(admin, tenantId, cid, q, acc, stack);
  }

  stack.delete(productId);
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
  for (const it of items ?? []) {
    const pid = it.product_id;
    if (!pid) continue;
    const qty = Number(it.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    await collectMaterialNeeds(admin, tenantId, pid, qty, needs, new Set());
  }

  return [...needs.entries()].map(([product_id, gross_qty]) => ({
    product_id,
    gross_qty: round4(gross_qty),
  }));
}

/** Subtrai stock (inventory) às necessidades brutas. */
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
    const available = round4(quantity_on_hand - reserved_quantity);
    const shortage = round4(Math.max(0, needed - available));
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
  purchase_orders: Array<{ id: string; po_number: string; supplier_id: string }>;
};

/** Para cada item com necessidade líquida > 0, cria pedido de compra em rascunho. */
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
    .select("id, preferred_supplier_id, cost_price, name, unit")
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
        unit: r.unit?.trim() || "UN",
      },
    ])
  );

  const bySupplier = new Map<
    string,
    Array<{ product_id: string; shortage: number; unit_price: number; unit: string; description: string }>
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

/** Se não faltar matéria-prima em stock, cria OP e itens a partir do pedido. */
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
    throw new Error("Este pedido já tem ordem de produção associada.");
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
