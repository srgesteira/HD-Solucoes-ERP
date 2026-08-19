import type { AdminClient, SaleLineInput } from "@/modules/vendas/lib/sales/sales-flow";
import {
  generateReceivablesForSalesOrder,
  insertSalesOrderItemsFromLines,
  nextSalesOrderNumber,
  rollbackSalesOrderCreation,
} from "@/modules/vendas/lib/sales/sales-flow";
import {
  lineNetSubtotal,
  roundMoney,
} from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import { getSalesOrderEditGuard } from "@/modules/vendas/lib/sales/sales-order-edit";
import { recalculateSalesOrderHeaderTotals } from "@/modules/vendas/lib/sales/sales-order-totals";
import {
  ensureReceivablesSyncedForSalesOrder,
  salesOrderRowToReceivablesInput,
} from "@/modules/vendas/lib/sales/sales-receivables";
import { insertSalesOrderLogsBestEffort } from "@/modules/vendas/lib/sales/sales-order-change-log";
import { applyFiscalToSalesOrderItems } from "@/modules/fiscal/lib/fiscal-rules-service";

const SPLITTABLE_STATUSES = new Set(["pending", "confirmed"]);

export type SalesOrderSplitLineInput = {
  itemId: string;
  quantityToNew: number;
};

export type SplitSalesOrderResult = {
  originalId: string;
  originalNumber: string;
  newId: string;
  newNumber: string;
};

type ItemRow = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  product_id: string | null;
  item_notes: string | null;
  usage_type: string | null;
  icms_rate: number | null;
  icms_value: number | null;
  ipi_rate: number | null;
  ipi_value: number | null;
  tax_base: number | null;
  unit_cost: number | null;
  pcp_deadline: string | null;
};

function splitAmount(
  total: number,
  stayQty: number,
  origQty: number
): { stay: number; moved: number } {
  const t = roundMoney(total);
  if (!(origQty > 0) || t === 0) return { stay: 0, moved: 0 };
  if (stayQty <= 0) return { stay: 0, moved: t };
  if (stayQty >= origQty) return { stay: t, moved: 0 };
  const stay = roundMoney(t * (stayQty / origQty));
  return { stay, moved: roundMoney(t - stay) };
}

function parseQty(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? parseFloat(raw.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseSplitLines(
  raw: unknown
): { ok: true; lines: SalesOrderSplitLineInput[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "Indique as quantidades a desmembrar." };
  }
  const lines: SalesOrderSplitLineInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, message: `Linha ${i + 1}: formato inválido.` };
    }
    const r = row as Record<string, unknown>;
    const itemId =
      typeof r.itemId === "string"
        ? r.itemId.trim()
        : typeof r.item_id === "string"
          ? r.item_id.trim()
          : "";
    if (!itemId) {
      return { ok: false, message: `Linha ${i + 1}: item inválido.` };
    }
    if (seen.has(itemId)) {
      return { ok: false, message: "Há itens repetidos no desmembrar." };
    }
    seen.add(itemId);
    const qty = parseQty(r.quantityToNew ?? r.quantity_to_new);
    if (qty === null) {
      return {
        ok: false,
        message: `Linha ${i + 1}: quantidade a mover inválida.`,
      };
    }
    lines.push({ itemId, quantityToNew: qty });
  }
  return { ok: true, lines };
}

export async function splitSalesOrder(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  lines: SalesOrderSplitLineInput[],
  userId: string | null
): Promise<
  | { ok: true; data: SplitSalesOrderResult }
  | { ok: false; message: string; status: number }
> {
  const { data: order, error: orderErr } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, status, mrp_processed, production_order_id, quote_id, client_name, client_document, client_email, client_phone, client_address, order_date, expected_delivery, pcp_deadline, notes, customer_po_number, payment_installments, payment_days_to_first_due, payment_days_between_installments, actual_delivery, total, discount"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderErr) {
    return { ok: false, message: orderErr.message, status: 500 };
  }
  if (!order) {
    return { ok: false, message: "Pedido não encontrado.", status: 404 };
  }

  if (!SPLITTABLE_STATUSES.has(order.status)) {
    return {
      ok: false,
      message:
        "Só é possível desmembrar pedidos pendentes ou confirmados, antes da produção.",
      status: 409,
    };
  }

  const guard = await getSalesOrderEditGuard(admin, tenantId, {
    id: order.id,
    mrp_processed: order.mrp_processed === true,
    production_order_id: order.production_order_id,
  });
  if (!guard.can_edit_items) {
    return {
      ok: false,
      message:
        "Não é possível desmembrar: o MRP já foi processado ou a produção já iniciou.",
      status: 409,
    };
  }

  const { data: items, error: itemsErr } = await admin
    .from("sales_order_items")
    .select(
      "id, description, quantity, unit, unit_price, discount, product_id, item_notes, usage_type, icms_rate, icms_value, ipi_rate, ipi_value, tax_base, unit_cost, pcp_deadline"
    )
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (itemsErr) {
    return { ok: false, message: itemsErr.message, status: 500 };
  }
  const itemRows = (items ?? []) as ItemRow[];
  if (!itemRows.length) {
    return { ok: false, message: "Pedido sem itens.", status: 400 };
  }

  const byId = new Map(itemRows.map((r) => [r.id, r]));
  const moveById = new Map(lines.map((l) => [l.itemId, l.quantityToNew]));

  for (const [itemId] of moveById) {
    if (!byId.has(itemId)) {
      return {
        ok: false,
        message: "Um dos itens não pertence a este pedido.",
        status: 400,
      };
    }
  }

  let totalStay = 0;
  let totalMove = 0;
  const newLines: SaleLineInput[] = [];
  const updates: { id: string; stayQty: number; orig: ItemRow }[] = [];
  const deletes: string[] = [];

  for (const orig of itemRows) {
    const origQty = Number(orig.quantity);
    const toNew = moveById.get(orig.id) ?? 0;
    if (toNew > origQty + 1e-9) {
      return {
        ok: false,
        message: `Quantidade a mover maior que a da linha «${orig.description}».`,
        status: 400,
      };
    }
    const stayQty = roundMoney(origQty - toNew);
    if (stayQty < -1e-9) {
      return {
        ok: false,
        message: `Quantidade inválida na linha «${orig.description}».`,
        status: 400,
      };
    }
    totalStay += Math.max(0, stayQty);
    totalMove += Math.max(0, toNew);

    if (toNew <= 1e-9) continue;

    const disc = splitAmount(Number(orig.discount ?? 0), stayQty, origQty);
    const icms = splitAmount(Number(orig.icms_value ?? 0), stayQty, origQty);
    const ipi = splitAmount(Number(orig.ipi_value ?? 0), stayQty, origQty);
    const taxBase = splitAmount(Number(orig.tax_base ?? 0), stayQty, origQty);

    const usage =
      orig.usage_type === "consumo" ||
      orig.usage_type === "materia_prima" ||
      orig.usage_type === "revenda"
        ? orig.usage_type
        : null;

    newLines.push({
      description: orig.description,
      quantity: toNew,
      unit: orig.unit || "UN",
      unit_price: Number(orig.unit_price),
      discount: disc.moved,
      product_id: orig.product_id,
      item_notes: orig.item_notes,
      usage_type: usage,
      icms_rate: Number(orig.icms_rate ?? 0),
      icms_value: icms.moved,
      ipi_rate: Number(orig.ipi_rate ?? 0),
      ipi_value: ipi.moved,
      tax_base: taxBase.moved,
    });

    if (stayQty <= 1e-9) {
      deletes.push(orig.id);
    } else {
      updates.push({ id: orig.id, stayQty, orig });
    }
  }

  if (totalMove <= 1e-9) {
    return {
      ok: false,
      message: "Indique pelo menos uma quantidade a enviar para o pedido novo.",
      status: 400,
    };
  }
  if (totalStay <= 1e-9) {
    return {
      ok: false,
      message: "Deixe pelo menos uma quantidade no pedido original.",
      status: 400,
    };
  }

  const orderNumber = await nextSalesOrderNumber(admin, tenantId);
  const expectedDelivery = order.expected_delivery
    ? String(order.expected_delivery).slice(0, 10)
    : String(order.order_date).slice(0, 10);
  const customerPo =
    (order.customer_po_number ?? "").trim() ||
    `${order.order_number} (desmembrado)`;

  const { data: profile } = userId
    ? await admin.from("user_profiles").select("id").eq("id", userId).maybeSingle()
    : { data: null };

  const { data: created, error: insErr } = await admin
    .from("sales_orders")
    .insert({
      tenant_id: tenantId,
      order_number: orderNumber,
      quote_id: null,
      client_name: order.client_name,
      client_document: order.client_document,
      client_email: order.client_email,
      client_phone: order.client_phone,
      client_address: order.client_address,
      order_date: order.order_date,
      expected_delivery: expectedDelivery,
      pcp_deadline: order.pcp_deadline,
      discount: 0,
      tax: 0,
      notes: order.notes
        ? `${order.notes}\nDesmembrado de ${order.order_number}.`
        : `Desmembrado de ${order.order_number}.`,
      customer_po_number: customerPo.slice(0, 60),
      status: order.status,
      created_by: profile?.id ?? null,
      payment_installments: order.payment_installments,
      payment_days_to_first_due: order.payment_days_to_first_due,
      payment_days_between_installments:
        order.payment_days_between_installments,
    })
    .select("id, order_number")
    .single();

  if (insErr?.code === "23505") {
    return { ok: false, message: "Número do pedido já existe.", status: 409 };
  }
  if (insErr || !created) {
    return {
      ok: false,
      message: "Erro ao criar pedido novo: " + (insErr?.message ?? "desconhecido"),
      status: 500,
    };
  }

  const itemErr = await insertSalesOrderItemsFromLines(
    admin,
    tenantId,
    created.id,
    newLines
  );
  if (itemErr.error) {
    await rollbackSalesOrderCreation(admin, tenantId, created.id);
    return {
      ok: false,
      message: "Erro ao gravar itens do pedido novo: " + itemErr.error,
      status: 500,
    };
  }

  for (const u of updates) {
    const origQty = Number(u.orig.quantity);
    const disc = splitAmount(Number(u.orig.discount ?? 0), u.stayQty, origQty);
    const icms = splitAmount(Number(u.orig.icms_value ?? 0), u.stayQty, origQty);
    const ipi = splitAmount(Number(u.orig.ipi_value ?? 0), u.stayQty, origQty);
    const taxBase = splitAmount(Number(u.orig.tax_base ?? 0), u.stayQty, origQty);
    const totalPrice = lineNetSubtotal(
      u.stayQty,
      Number(u.orig.unit_price),
      disc.stay
    );
    const { error: updErr } = await admin
      .from("sales_order_items")
      .update({
        quantity: u.stayQty,
        discount: disc.stay,
        icms_value: icms.stay,
        ipi_value: ipi.stay,
        tax_base: taxBase.stay,
        total_price: totalPrice,
      })
      .eq("id", u.id)
      .eq("tenant_id", tenantId);
    if (updErr) {
      await rollbackSalesOrderCreation(admin, tenantId, created.id);
      return {
        ok: false,
        message: "Erro ao actualizar itens do original: " + updErr.message,
        status: 500,
      };
    }
  }

  if (deletes.length) {
    const { error: delErr } = await admin
      .from("sales_order_items")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("sales_order_id", salesOrderId)
      .in("id", deletes);
    if (delErr) {
      await rollbackSalesOrderCreation(admin, tenantId, created.id);
      return {
        ok: false,
        message: "Erro ao remover itens movidos: " + delErr.message,
        status: 500,
      };
    }
  }

  const origTotals = await recalculateSalesOrderHeaderTotals(
    admin,
    tenantId,
    salesOrderId
  );
  if (origTotals.error) {
    await rollbackSalesOrderCreation(admin, tenantId, created.id);
    return {
      ok: false,
      message: "Erro ao recalcular totais do original: " + origTotals.error,
      status: 500,
    };
  }

  const { data: origFresh } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, order_date, expected_delivery, actual_delivery, total, client_name, client_document, payment_installments, payment_days_to_first_due, payment_days_between_installments"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (origFresh) {
    await ensureReceivablesSyncedForSalesOrder(
      admin,
      tenantId,
      salesOrderRowToReceivablesInput(origFresh),
      { total: true }
    );
  }

  const { data: newFresh, error: newFreshErr } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, order_date, expected_delivery, actual_delivery, total, client_name, client_document, payment_installments, payment_days_to_first_due, payment_days_between_installments"
    )
    .eq("id", created.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (newFreshErr || !newFresh) {
    await rollbackSalesOrderCreation(admin, tenantId, created.id);
    return { ok: false, message: "Erro ao recarregar pedido novo.", status: 500 };
  }

  const recv = await generateReceivablesForSalesOrder(
    admin,
    tenantId,
    {
      id: newFresh.id,
      order_number: newFresh.order_number,
      order_date: newFresh.order_date,
      expected_delivery: newFresh.expected_delivery,
      actual_delivery: newFresh.actual_delivery,
      total: newFresh.total,
      client_name: newFresh.client_name,
      client_document: newFresh.client_document,
      payment_installments: newFresh.payment_installments,
      payment_days_to_first_due: newFresh.payment_days_to_first_due,
      payment_days_between_installments:
        newFresh.payment_days_between_installments,
    },
    { provisional: true }
  );
  if (recv.error) {
    await rollbackSalesOrderCreation(admin, tenantId, created.id);
    return {
      ok: false,
      message: "Erro ao gerar contas a receber do pedido novo: " + recv.error,
      status: 500,
    };
  }

  try {
    await applyFiscalToSalesOrderItems(
      admin,
      tenantId,
      created.id,
      userId
    );
  } catch (fiscalErr) {
    console.warn(
      "[sales-order-split] Fiscal no pedido novo:",
      fiscalErr instanceof Error ? fiscalErr.message : fiscalErr
    );
  }

  await insertSalesOrderLogsBestEffort(admin, tenantId, salesOrderId, userId, [
    {
      field_name: "items",
      old_value: order.order_number,
      new_value: created.order_number,
      notes: `Desmembrado: linhas enviadas para ${created.order_number}.`,
    },
  ]);
  await insertSalesOrderLogsBestEffort(admin, tenantId, created.id, userId, [
    {
      field_name: "items",
      old_value: null,
      new_value: order.order_number,
      notes: `Criado por desmembrar de ${order.order_number}.`,
    },
  ]);

  return {
    ok: true,
    data: {
      originalId: order.id,
      originalNumber: order.order_number,
      newId: created.id,
      newNumber: created.order_number,
    },
  };
}
