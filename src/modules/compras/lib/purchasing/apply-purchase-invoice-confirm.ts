import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type { PurchaseInvoiceConfirmInput } from "@/shared/contracts/purchase-invoice.schema";
import { applyInventoryInbound } from "@/modules/almoxarifado/lib/inventory-inbound";
import { applyPurchaseOrderReceive } from "@/modules/compras/lib/purchasing/purchase-order-receive";
import { recordProductPriceHistory } from "@/modules/engenharia/lib/products/product-price-history";

type Admin = SupabaseClient<Database>;

export type ConfirmPurchaseInvoiceResult = {
  supplierInvoiceId: string;
  purchaseOrderIds: string[];
  primaryPurchaseOrderId: string | null;
  inventoryMovements: number;
  itemsProcessed: number;
};

async function refreshPurchaseOrderStatus(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string
): Promise<void> {
  const { data: items, error } = await admin
    .from("purchase_order_items")
    .select("quantity, received_quantity")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false);

  if (error) throw new Error(error.message);
  const rows = items ?? [];
  if (!rows.length) return;

  const allReceived = rows.every(
    (r) => Number(r.received_quantity) >= Number(r.quantity)
  );
  const anyReceived = rows.some((r) => Number(r.received_quantity) > 0);

  if (allReceived) {
    await applyPurchaseOrderReceive(admin, tenantId, purchaseOrderId);
    await admin
      .from("purchase_orders")
      .update({
        status: "received",
        actual_delivery: new Date().toISOString().slice(0, 10),
      })
      .eq("id", purchaseOrderId)
      .eq("tenant_id", tenantId)
      .eq("is_suggestion", false);
    return;
  }

  if (anyReceived) {
    await admin
      .from("purchase_orders")
      .update({ status: "partial" })
      .eq("id", purchaseOrderId)
      .eq("tenant_id", tenantId)
      .eq("is_suggestion", false)
      .neq("status", "received");
  }
}

export async function applyPurchaseInvoiceConfirm(
  admin: Admin,
  tenantId: string,
  userId: string | null,
  input: PurchaseInvoiceConfirmInput
): Promise<ConfirmPurchaseInvoiceResult> {
  const inv = input.invoiceData;
  const divergenceNotes: string[] = [];

  const { data: invoiceRow, error: invErr } = await admin
    .from("supplier_invoices")
    .insert({
      tenant_id: tenantId,
      supplier_id: input.supplierId ?? null,
      invoice_number: inv.invoiceNumber ?? null,
      invoice_series: inv.invoiceSeries ?? null,
      access_key: inv.accessKey ?? null,
      issue_date: inv.issueDate ?? null,
      supplier_document: inv.supplierDocument ?? null,
      supplier_name: inv.supplierName ?? null,
      total_amount: inv.totalAmount ?? 0,
      notes: input.invoiceNotes ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (invErr) {
    throw new Error("Erro ao gravar NF-e: " + invErr.message);
  }

  const supplierInvoiceId = invoiceRow.id;
  const touchedPoIds = new Set<string>();
  let inventoryMovements = 0;

  for (const map of input.mappings) {
    const line = inv.items[map.invoiceLineIndex] as
      | { description?: string; productCode?: string }
      | undefined;
    const description =
      typeof line?.description === "string" ?
        line.description
      : `Item ${map.invoiceLineIndex + 1}`;

    const qty = map.quantity;
    const unitPrice = map.unitPrice ?? 0;

    if (map.purchaseOrderItemId) {
      const { data: poi, error: poiErr } = await admin
        .from("purchase_order_items")
        .select(
          "id, purchase_order_id, product_id, quantity, received_quantity, unit_price, description"
        )
        .eq("id", map.purchaseOrderItemId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (poiErr) throw new Error(poiErr.message);
      if (!poi) throw new Error("Item de pedido de compra não encontrado.");

      const ordered = Number(poi.quantity);
      const prevRecv = Number(poi.received_quantity ?? 0);
      const remaining = Math.max(0, ordered - prevRecv);
      const toReceive = Math.min(qty, remaining > 0 ? remaining : qty);
      const newRecv = prevRecv + toReceive;

      if (Math.abs(qty - remaining) > 0.0001 && remaining > 0) {
        divergenceNotes.push(
          `Linha "${description.slice(0, 40)}": NF ${qty} vs pendente ${remaining} no PC.`
        );
      }
      if (
        unitPrice > 0 &&
        Math.abs(unitPrice - Number(poi.unit_price)) > 0.01
      ) {
        divergenceNotes.push(
          `Linha "${description.slice(0, 40)}": preço NF ${unitPrice.toFixed(2)} vs PC ${Number(poi.unit_price).toFixed(2)}.`
        );
      }

      const { error: upPoi } = await admin
        .from("purchase_order_items")
        .update({ received_quantity: newRecv })
        .eq("id", poi.id)
        .eq("tenant_id", tenantId);

      if (upPoi) throw new Error(upPoi.message);

      if (poi.purchase_order_id) {
        touchedPoIds.add(poi.purchase_order_id);
      }

      const productId = map.productId || poi.product_id;
      if (productId && toReceive > 0) {
        const invRes = await applyInventoryInbound(
          admin,
          tenantId,
          productId,
          toReceive,
          {
            reason: `NF-e compra (${inv.invoiceNumber ?? supplierInvoiceId})`,
            referenceId: supplierInvoiceId,
          }
        );
        if (invRes.error) throw new Error(invRes.error);
        inventoryMovements += 1;

        if (unitPrice > 0) {
          await recordProductPriceHistory(admin, tenantId, productId, {
            priceType: "purchase",
            value: unitPrice,
            notes: `NF-e ${inv.invoiceNumber ?? ""} — conciliação`,
          });
        }
      }
    } else {
      const invRes = await applyInventoryInbound(
        admin,
        tenantId,
        map.productId,
        qty,
        {
          reason: `NF-e compra — entrada directa (${inv.invoiceNumber ?? ""})`,
          referenceId: supplierInvoiceId,
        }
      );
      if (invRes.error) throw new Error(invRes.error);
      inventoryMovements += 1;

      if (unitPrice > 0) {
        await recordProductPriceHistory(admin, tenantId, map.productId, {
          priceType: "purchase",
          value: unitPrice,
          notes: `NF-e ${inv.invoiceNumber ?? ""} — nova compra`,
        });
      }
    }

    await admin.from("supplier_invoice_items").insert({
      tenant_id: tenantId,
      supplier_invoice_id: supplierInvoiceId,
      line_index: map.invoiceLineIndex + 1,
      description,
      product_code:
        typeof line?.productCode === "string" ? line.productCode : null,
      quantity: qty,
      unit: "UN",
      unit_price: unitPrice,
      total_price: unitPrice * qty,
      purchase_order_id: map.purchaseOrderId ?? null,
      purchase_order_item_id: map.purchaseOrderItemId ?? null,
      product_id: map.productId,
    });
  }

  for (const poId of touchedPoIds) {
    await refreshPurchaseOrderStatus(admin, tenantId, poId);
  }

  if (divergenceNotes.length) {
    const noteBlock = `[NF-e ${inv.invoiceNumber ?? ""}] ${divergenceNotes.join(" ")}`;
    for (const poId of touchedPoIds) {
      const { data: po } = await admin
        .from("purchase_orders")
        .select("notes")
        .eq("id", poId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const prev = po?.notes?.trim() ?? "";
      const merged = prev ? `${prev}\n${noteBlock}` : noteBlock;
      await admin
        .from("purchase_orders")
        .update({ notes: merged.slice(0, 8000) })
        .eq("id", poId)
        .eq("tenant_id", tenantId);
    }
  }

  const purchaseOrderIds = [...touchedPoIds];
  const primaryPurchaseOrderId =
    purchaseOrderIds.length === 1 ? purchaseOrderIds[0]! : purchaseOrderIds[0] ?? null;

  return {
    supplierInvoiceId,
    purchaseOrderIds,
    primaryPurchaseOrderId,
    inventoryMovements,
    itemsProcessed: input.mappings.length,
  };
}
