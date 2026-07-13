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

export type ConvertPurchaseQuoteLineInput = {
  item_id: string;
  unit_price?: number;
  quantity?: number;
};

export type ConvertPurchaseQuoteResult =
  | {
      ok: true;
      purchase_order_id: string;
      po_number: string;
    }
  | { ok: false; message: string; status: number };

async function refreshPurchaseOrderTotals(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string
): Promise<void> {
  const { data: items, error } = await admin
    .from("purchase_order_items")
    .select("quantity, unit_price, icms_value, ipi_value, tax_base")
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", purchaseOrderId);
  if (error) throw new Error(error.message);

  const taxes = aggregatePurchaseLineTaxes(
    (items ?? []).map((row) => ({
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
      icmsValue: Number(row.icms_value ?? 0),
      ipiValue: Number(row.ipi_value ?? 0),
      taxBase: Number(row.tax_base ?? 0),
    }))
  );

  const { data: header } = await admin
    .from("purchase_orders")
    .select(
      "discount, tax, freight_cost, insurance_cost, other_costs, total_tax_non_creditable"
    )
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const total = computePurchaseOrderTotal({
    subtotal: taxes.subtotal,
    discount: Number(header?.discount ?? 0),
    tax: Number(header?.tax ?? 0),
    freight_cost: Number(header?.freight_cost ?? 0),
    insurance_cost: Number(header?.insurance_cost ?? 0),
    other_costs: Number(header?.other_costs ?? 0),
    total_tax_non_creditable: Number(header?.total_tax_non_creditable ?? 0),
    total_ipi: taxes.totalIpi,
  });

  const { error: updErr } = await admin
    .from("purchase_orders")
    .update({
      subtotal: taxes.subtotal,
      total,
      total_icms: taxes.totalIcms,
      total_ipi: taxes.totalIpi,
      total_tax_base: taxes.totalTaxBase,
    })
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId);
  if (updErr) throw new Error(updErr.message);
}

/**
 * Converte solicitação de orçamento (RFQ) em pedido de compra —
 * espelha `convertQuoteToSalesOrder` do módulo de vendas.
 */
export async function convertPurchaseQuoteRequestToOrder(
  admin: Admin,
  tenantId: string,
  requestId: string,
  userId: string,
  args: {
    supplier_id: string;
    lines?: ConvertPurchaseQuoteLineInput[];
  }
): Promise<ConvertPurchaseQuoteResult> {
  const supplierId = args.supplier_id?.trim();
  if (!supplierId) {
    return { ok: false, message: "Seleccione o fornecedor do pedido.", status: 400 };
  }

  const { data: supplier, error: supErr } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (supErr) {
    return { ok: false, message: supErr.message, status: 400 };
  }
  if (!supplier) {
    return { ok: false, message: "Fornecedor inválido ou inactivo.", status: 400 };
  }

  const { data: request, error: reqErr } = await admin
    .from("purchase_quote_requests")
    .select(
      "id, status, need_date, notes, converted_to_purchase_order_id, request_number"
    )
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (reqErr) {
    return { ok: false, message: reqErr.message, status: 500 };
  }
  if (!request) {
    return { ok: false, message: "Solicitação não encontrada.", status: 404 };
  }
  if (request.converted_to_purchase_order_id) {
    return {
      ok: false,
      message: "Solicitação já convertida em pedido de compra.",
      status: 409,
    };
  }
  if (request.status === "cancelled") {
    return {
      ok: false,
      message: "Solicitação cancelada não pode gerar pedido.",
      status: 400,
    };
  }
  if (request.status !== "draft" && request.status !== "sent") {
    return {
      ok: false,
      message: "Só é possível converter solicitações em aberto.",
      status: 400,
    };
  }

  const { data: items, error: itemErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, product_id, description, quantity, unit, unit_price, need_date, follow_up_date, purchase_order_id, status"
    )
    .eq("tenant_id", tenantId)
    .eq("purchase_quote_request_id", requestId)
    .is("purchase_order_id", null)
    .eq("status", "draft");

  if (itemErr) {
    return { ok: false, message: itemErr.message, status: 500 };
  }
  if (!items?.length) {
    return {
      ok: false,
      message: "Solicitação sem itens disponíveis para converter.",
      status: 400,
    };
  }

  const priceById = new Map<string, { unit_price?: number; quantity?: number }>();
  for (const line of args.lines ?? []) {
    if (typeof line.item_id !== "string" || !line.item_id) continue;
    priceById.set(line.item_id, {
      unit_price:
        line.unit_price !== undefined ? Number(line.unit_price) : undefined,
      quantity: line.quantity !== undefined ? Number(line.quantity) : undefined,
    });
  }

  const orderDate = new Date().toISOString().slice(0, 10);
  const expectedDelivery = request.need_date
    ? String(request.need_date).slice(0, 10)
    : items
        .map((i) => i.need_date ?? i.follow_up_date)
        .filter((d): d is string => Boolean(d))
        .sort()[0]
        ?.slice(0, 10) ?? null;

  let poNumber: string;
  try {
    poNumber = await nextPurchaseOrderNumber(admin, tenantId, orderDate);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao gerar número do PC",
      status: 500,
    };
  }

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
      order_date: orderDate,
      expected_delivery: expectedDelivery,
      status: "draft",
      notes: request.notes,
      requested_by: profile?.id ?? null,
      purchase_quote_request_id: requestId,
    })
    .select("id, po_number")
    .single();

  if (poErr) {
    return { ok: false, message: poErr.message, status: 400 };
  }

  for (const item of items) {
    const patch = priceById.get(item.id);
    const quantity =
      patch?.quantity !== undefined &&
      Number.isFinite(patch.quantity) &&
      patch.quantity > 0
        ? patch.quantity
        : Number(item.quantity ?? 0);
    const unitPrice =
      patch?.unit_price !== undefined &&
      Number.isFinite(patch.unit_price) &&
      patch.unit_price >= 0
        ? patch.unit_price
        : Number(item.unit_price ?? 0);
    const totalPrice = roundMoney(lineSubtotal(quantity, unitPrice));

    const { error: updErr } = await admin
      .from("purchase_order_items")
      .update({
        purchase_order_id: po.id,
        status: "linked",
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        tax_base: totalPrice,
        suggested_supplier_id: supplierId,
      })
      .eq("id", item.id)
      .eq("tenant_id", tenantId);
    if (updErr) {
      await admin.from("purchase_orders").delete().eq("id", po.id);
      return { ok: false, message: updErr.message, status: 400 };
    }
  }

  try {
    await refreshPurchaseOrderTotals(admin, tenantId, po.id);
  } catch (e) {
    await admin.from("purchase_orders").delete().eq("id", po.id);
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao recalcular totais",
      status: 500,
    };
  }

  const { error: linkErr } = await admin
    .from("purchase_quote_requests")
    .update({
      status: "converted",
      converted_to_purchase_order_id: po.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("tenant_id", tenantId);

  if (linkErr) {
    return { ok: false, message: linkErr.message, status: 500 };
  }

  return {
    ok: true,
    purchase_order_id: po.id,
    po_number: po.po_number,
  };
}

export async function markPurchaseQuoteRequestSent(
  admin: Admin,
  tenantId: string,
  requestId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data: request, error } = await admin
    .from("purchase_quote_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) throw new Error("Solicitação não encontrada.");
  if (request.status === "converted" || request.status === "cancelled") return;

  await admin
    .from("purchase_quote_requests")
    .update({ status: "sent", updated_at: now })
    .eq("id", requestId)
    .eq("tenant_id", tenantId);

  await admin
    .from("purchase_order_items")
    .update({ quotation_sent_at: now })
    .eq("tenant_id", tenantId)
    .eq("purchase_quote_request_id", requestId)
    .is("purchase_order_id", null);
}
