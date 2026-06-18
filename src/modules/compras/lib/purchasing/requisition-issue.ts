import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { nextPurchaseOrderNumber } from "@/modules/compras/lib/purchasing/purchase-order-number";
import {
  aggregatePurchaseLineTaxes,
  lineSubtotal,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { computePurchaseOrderTotal } from "@/modules/compras/lib/purchasing/purchase-order-totals";

type Admin = SupabaseClient<Database>;

type RequisitionItemRow = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  follow_up_date: string | null;
  need_date: string | null;
  purchase_order_id: string | null;
  status: string;
};

export async function resolveSupplierIdForProduct(
  admin: Admin,
  tenantId: string,
  productId: string | null,
  overrideSupplierId?: string | null
): Promise<string | null> {
  if (overrideSupplierId) {
    const { data: ok } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", overrideSupplierId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!ok) throw new Error("Fornecedor seleccionado inválido ou inactivo.");
    return overrideSupplierId;
  }

  if (!productId) return null;

  const { data: product } = await admin
    .from("products")
    .select("preferred_supplier_id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const prefId = product?.preferred_supplier_id;
  if (!prefId) return null;

  const { data: ok } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", prefId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  return ok?.id ?? null;
}

export type IssueBulkResult = {
  purchase_order_id: string;
  po_number: string;
  /** Linhas no PC após agrupar produtos iguais. */
  linked_count: number;
  /** Requisições seleccionadas antes do agrupamento. */
  requisition_count: number;
  /** Requisições absorvidas numa linha já existente (mesmo produto). */
  merged_count: number;
};

function requisitionMergeKey(
  item: Pick<RequisitionItemRow, "product_id" | "description" | "unit">
): string {
  const unit = (item.unit || "UN").trim().toUpperCase();
  if (item.product_id) return `p:${item.product_id}:${unit}`;
  return `d:${item.description.trim().toLowerCase()}:${unit}`;
}

/** Agrupa requisições do mesmo produto/unidade numa única linha do PC. */
export function planMergedRequisitionItems(items: RequisitionItemRow[]): {
  linkIds: string[];
  deleteIds: string[];
  quantityUpdates: Array<{ id: string; quantity: number; total_price: number }>;
} {
  const groups = new Map<string, RequisitionItemRow[]>();
  for (const it of items) {
    const key = requisitionMergeKey(it);
    const list = groups.get(key) ?? [];
    list.push(it);
    groups.set(key, list);
  }

  const linkIds: string[] = [];
  const deleteIds: string[] = [];
  const quantityUpdates: Array<{
    id: string;
    quantity: number;
    total_price: number;
  }> = [];

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const da = a.follow_up_date ?? a.need_date ?? "9999";
      const db = b.follow_up_date ?? b.need_date ?? "9999";
      return da.localeCompare(db);
    });
    const primary = sorted[0]!;
    const totalQty = sorted.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0),
      0
    );
    const unitPrice = Number(primary.unit_price ?? 0);

    linkIds.push(primary.id);
    if (sorted.length > 1 || totalQty !== Number(primary.quantity ?? 0)) {
      quantityUpdates.push({
        id: primary.id,
        quantity: totalQty,
        total_price: roundMoney(lineSubtotal(totalQty, unitPrice)),
      });
    }
    for (let i = 1; i < sorted.length; i++) {
      deleteIds.push(sorted[i]!.id);
    }
  }

  return { linkIds, deleteIds, quantityUpdates };
}

async function refreshPurchaseOrderTotals(
  admin: Admin,
  tenantId: string,
  orderId: string
): Promise<void> {
  const { data: items, error: itemsErr } = await admin
    .from("purchase_order_items")
    .select("quantity, unit_price, icms_value, ipi_value, tax_base")
    .eq("purchase_order_id", orderId)
    .eq("tenant_id", tenantId);

  if (itemsErr) throw new Error(itemsErr.message);

  const agg = aggregatePurchaseLineTaxes(
    (items ?? []).map((row) => ({
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
      icmsValue: Number(row.icms_value ?? 0),
      ipiValue: Number(row.ipi_value ?? 0),
      taxBase: Number(row.tax_base ?? 0),
    }))
  );

  const { data: po, error: poErr } = await admin
    .from("purchase_orders")
    .select(
      "discount, tax, freight_cost, insurance_cost, other_costs, total_tax_non_creditable"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (poErr) throw new Error(poErr.message);
  if (!po) throw new Error("Pedido não encontrado ao actualizar totais.");

  const total = computePurchaseOrderTotal({
    subtotal: agg.subtotal,
    discount: Number(po.discount ?? 0),
    tax: Number(po.tax ?? 0),
    total_icms: agg.totalIcms,
    total_ipi: agg.totalIpi,
    freight_cost: Number(po.freight_cost ?? 0),
    insurance_cost: Number(po.insurance_cost ?? 0),
    other_costs: Number(po.other_costs ?? 0),
    total_tax_non_creditable: Number(po.total_tax_non_creditable ?? 0),
  });

  const { error: upErr } = await admin
    .from("purchase_orders")
    .update({
      subtotal: agg.subtotal,
      total_icms: agg.totalIcms,
      total_ipi: agg.totalIpi,
      total_tax_base: agg.totalTaxBase,
      total,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);

  if (upErr) throw new Error(upErr.message);
}

export async function issueRequisitionsAsPurchaseOrder(
  admin: Admin,
  tenantId: string,
  userId: string,
  requisitionIds: string[],
  options?: { supplier_id?: string | null; po_number?: string | null }
): Promise<IssueBulkResult> {
  const ids = [...new Set(requisitionIds.filter(Boolean))];
  if (!ids.length) throw new Error("Seleccione pelo menos uma requisição.");

  const { data: items, error: itemErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, product_id, description, quantity, unit, unit_price, follow_up_date, need_date, purchase_order_id, status"
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("id", ids);

  if (itemErr) throw new Error(itemErr.message);
  if ((items ?? []).length !== ids.length) {
    throw new Error("Uma ou mais requisições não foram encontradas.");
  }

  const rows = (items ?? []) as RequisitionItemRow[];

  for (const it of rows) {
    if (it.purchase_order_id || it.status !== "draft") {
      throw new Error(
        "Só é possível emitir requisições em rascunho ainda não vinculadas a um PC."
      );
    }
  }

  const { linkIds, deleteIds, quantityUpdates } =
    planMergedRequisitionItems(rows);

  for (const upd of quantityUpdates) {
    const { error } = await admin
      .from("purchase_order_items")
      .update({
        quantity: upd.quantity,
        total_price: upd.total_price,
      })
      .eq("id", upd.id)
      .eq("tenant_id", tenantId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
  }

  if (deleteIds.length) {
    const { error: delErr } = await admin
      .from("purchase_order_items")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("status", "draft")
      .is("purchase_order_id", null)
      .in("id", deleteIds);
    if (delErr) throw new Error(delErr.message);
  }

  const first = rows[0]!;
  const supplierId = await resolveSupplierIdForProduct(
    admin,
    tenantId,
    first.product_id,
    options?.supplier_id
  );

  const followUps = rows
    .map((i) => i.follow_up_date ?? i.need_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const expectedDelivery = followUps[0] ? String(followUps[0]).slice(0, 10) : null;

  const poNumber =
    options?.po_number?.trim() ||
    (await nextPurchaseOrderNumber(admin, tenantId, expectedDelivery));

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const { data: po, error: poErr } = await admin
    .from("purchase_orders")
    .insert({
      tenant_id: tenantId,
      po_number: poNumber,
      supplier_id: supplierId,
      status: "draft",
      expected_delivery: expectedDelivery,
      requested_by: profile?.id ?? null,
    })
    .select("id, po_number")
    .single();

  if (poErr) throw new Error(poErr.message);

  const { error: linkErr } = await admin
    .from("purchase_order_items")
    .update({
      purchase_order_id: po.id,
      status: "linked",
    })
    .eq("tenant_id", tenantId)
    .in("id", linkIds);

  if (linkErr) {
    await admin.from("purchase_orders").delete().eq("id", po.id);
    throw new Error(linkErr.message);
  }

  await refreshPurchaseOrderTotals(admin, tenantId, po.id);

  return {
    purchase_order_id: po.id,
    po_number: po.po_number,
    linked_count: linkIds.length,
    requisition_count: ids.length,
    merged_count: ids.length - linkIds.length,
  };
}
