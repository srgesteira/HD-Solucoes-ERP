import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  aggregatePurchaseLineTaxes,
  lineSubtotal,
  parseTaxAmount,
  parseTaxRate,
  parseTaxValueField,
  roundMoney,
} from "@/lib/purchasing/purchase-order-item-taxes";

type AdminClient = SupabaseClient<Database>;

export type PurchaseOrderLineInput = {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  icms_rate: number;
  icms_value: number;
  ipi_rate: number;
  ipi_value: number;
  tax_base: number;
};

export const PURCHASE_ORDER_ITEM_EDIT_STATUSES = new Set([
  "draft",
  "sent",
]);

export function canEditPurchaseOrderItems(status: string): boolean {
  return PURCHASE_ORDER_ITEM_EDIT_STATUSES.has(status);
}

export function parsePurchaseOrderLines(raw: unknown):
  | { ok: true; lines: PurchaseOrderLineInput[] }
  | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: "items deve ser uma lista." };
  }

  const lines: PurchaseOrderLineInput[] = [];

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, message: `Item ${i + 1} inválido.` };
    }
    const r = row as Record<string, unknown>;

    const description =
      typeof r.description === "string" ? r.description.trim() : "";
    if (!description) {
      return { ok: false, message: `Item ${i + 1}: descrição obrigatória.` };
    }

    const quantityRaw = r.quantity;
    const quantity =
      typeof quantityRaw === "number"
        ? quantityRaw
        : typeof quantityRaw === "string"
          ? parseFloat(quantityRaw.replace(",", "."))
          : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false,
        message: `Item ${i + 1}: quantidade inválida.`,
      };
    }

    const unitPriceRaw = r.unit_price;
    const unit_price =
      typeof unitPriceRaw === "number"
        ? unitPriceRaw
        : typeof unitPriceRaw === "string"
          ? parseFloat(unitPriceRaw.replace(",", "."))
          : NaN;
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      return {
        ok: false,
        message: `Item ${i + 1}: preço unitário inválido.`,
      };
    }

    const icms_rate =
      r.icms_rate === undefined || r.icms_rate === null
        ? 0
        : parseTaxRate(r.icms_rate);
    if (icms_rate === null) {
      return { ok: false, message: `Item ${i + 1}: alíquota ICMS inválida.` };
    }

    const ipi_rate =
      r.ipi_rate === undefined || r.ipi_rate === null
        ? 0
        : parseTaxRate(r.ipi_rate);
    if (ipi_rate === null) {
      return { ok: false, message: `Item ${i + 1}: alíquota IPI inválida.` };
    }

    const icms_value =
      parseTaxValueField(r, "icms_value", "icms_amount") === undefined ||
      parseTaxValueField(r, "icms_value", "icms_amount") === null
        ? 0
        : parseTaxAmount(parseTaxValueField(r, "icms_value", "icms_amount"));
    if (icms_value === null) {
      return { ok: false, message: `Item ${i + 1}: valor ICMS inválido.` };
    }

    const ipi_value =
      parseTaxValueField(r, "ipi_value", "ipi_amount") === undefined ||
      parseTaxValueField(r, "ipi_value", "ipi_amount") === null
        ? 0
        : parseTaxAmount(parseTaxValueField(r, "ipi_value", "ipi_amount"));
    if (ipi_value === null) {
      return { ok: false, message: `Item ${i + 1}: valor IPI inválido.` };
    }

    const subtotal = lineSubtotal(quantity, unit_price);
    const tax_base =
      r.tax_base === undefined || r.tax_base === null
        ? roundMoney(subtotal + ipi_value)
        : parseTaxAmount(r.tax_base);
    if (tax_base === null) {
      return { ok: false, message: `Item ${i + 1}: base de cálculo inválida.` };
    }

    const unit =
      r.unit !== undefined && r.unit !== null && String(r.unit).trim()
        ? String(r.unit).trim()
        : "UN";

    const product_id =
      r.product_id === undefined || r.product_id === null
        ? null
        : String(r.product_id).trim() || null;

    const id =
      r.id === undefined || r.id === null
        ? undefined
        : String(r.id).trim() || undefined;

    lines.push({
      id,
      product_id,
      description,
      quantity,
      unit,
      unit_price,
      icms_rate,
      icms_value,
      ipi_rate,
      ipi_value,
      tax_base,
    });
  }

  if (!lines.length) {
    return { ok: false, message: "O pedido deve ter pelo menos um item." };
  }

  return { ok: true, lines };
}

export type SyncPurchaseOrderItemsResult =
  | {
      ok: true;
      subtotal: number;
      total_icms: number;
      total_ipi: number;
      total_tax_base: number;
    }
  | { ok: false; message: string };

/** Sincroniza itens do PC preservando vínculos MRP em linhas existentes. */
export async function syncPurchaseOrderItems(
  admin: AdminClient,
  tenantId: string,
  orderId: string,
  lines: PurchaseOrderLineInput[]
): Promise<SyncPurchaseOrderItemsResult> {
  const { data: existing, error: loadErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, product_id, received_quantity, sales_order_item_id, trace_key, production_order_item_id, production_order_id, production_item_id, status, quotation_sent_at, follow_up_date"
    )
    .eq("purchase_order_id", orderId)
    .eq("tenant_id", tenantId);

  if (loadErr) {
    return { ok: false, message: loadErr.message };
  }

  const existingById = new Map((existing ?? []).map((row) => [row.id, row]));
  const keepIds = new Set<string>();

  const productIds = [
    ...new Set(
      lines
        .map((l) => l.product_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (productIds.length) {
    const { data: prods, error: pErr } = await admin
      .from("products")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", productIds);
    if (pErr) return { ok: false, message: pErr.message };
    const found = new Set((prods ?? []).map((p) => p.id));
    for (const pid of productIds) {
      if (!found.has(pid)) {
        return { ok: false, message: "Produto inválido numa linha." };
      }
    }
  }

  for (const line of lines) {
    const total_price = roundMoney(lineSubtotal(line.quantity, line.unit_price));

    const itemPayload = {
      product_id: line.product_id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      total_price,
      icms_rate: line.icms_rate,
      icms_value: line.icms_value,
      ipi_rate: line.ipi_rate,
      ipi_value: line.ipi_value,
      tax_base: line.tax_base,
    };

    if (line.id && existingById.has(line.id)) {
      const ex = existingById.get(line.id)!;
      const received = Number(ex.received_quantity ?? 0);
      if (received > 0 && line.quantity < received) {
        return {
          ok: false,
          message: `A quantidade do item «${line.description}» não pode ser inferior ao já recebido (${received}).`,
        };
      }

      const { error: upErr } = await admin
        .from("purchase_order_items")
        .update(itemPayload)
        .eq("id", line.id)
        .eq("purchase_order_id", orderId)
        .eq("tenant_id", tenantId);

      if (upErr) return { ok: false, message: upErr.message };
      keepIds.add(line.id);
    } else {
      const { error: insErr } = await admin.from("purchase_order_items").insert({
        tenant_id: tenantId,
        purchase_order_id: orderId,
        ...itemPayload,
        status: "linked",
      });

      if (insErr) return { ok: false, message: insErr.message };
    }
  }

  for (const ex of existing ?? []) {
    if (keepIds.has(ex.id)) continue;
    const received = Number(ex.received_quantity ?? 0);
    if (received > 0) {
      return {
        ok: false,
        message:
          "Não é possível remover itens que já tiveram recebimento parcial.",
      };
    }

    const { error: delErr } = await admin
      .from("purchase_order_items")
      .delete()
      .eq("id", ex.id)
      .eq("purchase_order_id", orderId)
      .eq("tenant_id", tenantId);

    if (delErr) return { ok: false, message: delErr.message };
  }

  const totals = aggregatePurchaseLineTaxes(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unit_price,
      icmsValue: l.icms_value,
      ipiValue: l.ipi_value,
      taxBase: l.tax_base,
    }))
  );

  const { error: poUpErr } = await admin
    .from("purchase_orders")
    .update({
      subtotal: totals.subtotal,
      total_icms: totals.totalIcms,
      total_ipi: totals.totalIpi,
      total_tax_base: totals.totalTaxBase,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);

  if (poUpErr) return { ok: false, message: poUpErr.message };

  return {
    ok: true,
    subtotal: totals.subtotal,
    total_icms: totals.totalIcms,
    total_ipi: totals.totalIpi,
    total_tax_base: totals.totalTaxBase,
  };
}
