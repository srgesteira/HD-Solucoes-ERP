import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";
import { computePurchaseOrderTotal, num } from "@/modules/compras/lib/purchasing/purchase-order-totals";
import { applyPurchaseOrderReceive } from "@/modules/compras/lib/purchasing/purchase-order-receive";
import {
  canEditPurchaseOrderItems,
  syncPurchaseOrderItems,
  type PurchaseOrderLineInput,
} from "@/modules/compras/lib/purchasing/purchase-order-edit";
import { purchaseOrderItemsPayloadSchema } from "@/shared/contracts/purchase-order.schema";
import { lineSubtotal, roundMoney } from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import {
  coerceSalesOrderInt,
  parsePaymentDaysBetween,
} from "@/shared/contracts/sales-order.schema";
import { checkPurchaseOrderExpectedDeliveryVsProduction } from "@/modules/compras/lib/purchasing/purchase-schedule-conflicts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type PurchaseOrderUpdate =
  Database["public"]["Tables"]["purchase_orders"]["Update"];

const ORDER_DETAIL_SELECT =
  `
  *,
  supplier:suppliers(*),
  items:purchase_order_items(
    *,
    product:products!purchase_order_items_product_id_fkey(*),
    production_order:production_orders!purchase_order_items_production_order_id_fkey(*)
  ),
  requested_by_user:user_profiles!purchase_orders_requested_by_fkey(*),
  approved_by_user:user_profiles!purchase_orders_approved_by_fkey(*)
`.trim();

const PO_STATUSES = new Set([
  "draft",
  "sent",
  "confirmed",
  "partial",
  "received",
  "cancelled",
]);

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("purchase_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar pedido: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Pedido não encontrado", 404);

  return apiOk({ data });
}

/** Atualização rápida do prazo de entrega (cronograma de compras). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const raw =
    b.expected_delivery_date ?? b.expected_delivery;
  const expected_delivery =
    raw === null || raw === undefined || raw === ""
      ? null
      : String(raw).slice(0, 10);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("purchase_orders")
    .update({ expected_delivery })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, po_number, expected_delivery, status")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Pedido não encontrado", 404);

  let conflict = null;
  if (expected_delivery) {
    conflict = await checkPurchaseOrderExpectedDeliveryVsProduction(
      admin,
      tenantId,
      id,
      expected_delivery
    );
  }

  return apiOk({
    data,
    conflict,
    warning: conflict
      ? `Prazo alterado, mas pode atrasar a produção do pedido ${conflict.order_number ?? ""} – verifique no PCP.`
      : null,
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão para alterar pedidos de compra", 403);
  }

  const admin = createSupabaseAdminClient();
  const updateData: PurchaseOrderUpdate = {};

  const { data: existingOrder, error: existingErr } = await admin
    .from("purchase_orders")
    .select(
      "id, status, subtotal, discount, tax, total_icms, total_ipi, total_tax_base, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existingErr) {
    return apiError(
      "Erro ao validar pedido: " + existingErr.message,
      supabaseErrorToHttp(existingErr.code)
    );
  }
  if (!existingOrder) return apiError("Pedido não encontrado", 404);

  if (existingOrder.status === "cancelled") {
    return apiError("Pedido cancelado não pode ser alterado.", 409);
  }

  if (b.items !== undefined) {
    if (!canEditPurchaseOrderItems(existingOrder.status)) {
      return apiError(
        "Itens só podem ser alterados em pedidos em rascunho ou enviados.",
        409
      );
    }
    const zItems = purchaseOrderItemsPayloadSchema.safeParse(b.items);
    if (!zItems.success) {
      return apiError(
        zItems.error.issues[0]?.message ?? "Itens inválidos",
        400
      );
    }
    const linesForSync: PurchaseOrderLineInput[] = zItems.data.map((row) => {
      const sub = lineSubtotal(row.quantity, row.unit_price);
      const tax_base =
        row.tax_base !== undefined
          ? roundMoney(row.tax_base)
          : roundMoney(sub + row.ipi_value);
      return {
        id: row.id,
        product_id: row.product_id,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        icms_rate: row.icms_rate,
        icms_value: row.icms_value,
        ipi_rate: row.ipi_rate,
        ipi_value: row.ipi_value,
        tax_base,
      };
    });
    const sync = await syncPurchaseOrderItems(
      admin,
      tenantId,
      id,
      linesForSync
    );
    if (!sync.ok) return apiError(sync.message, 400);
    updateData.subtotal = sync.subtotal;
    updateData.total_icms = sync.total_icms;
    updateData.total_ipi = sync.total_ipi;
    updateData.total_tax_base = sync.total_tax_base;
  }

  if (b.payment_installments !== undefined && b.payment_installments !== null) {
    const v = coerceSalesOrderInt(b.payment_installments, 0);
    if (v < 1) return apiError("payment_installments inválido", 400);
    updateData.payment_installments = v;
  }
  if (
    b.payment_days_to_first_due !== undefined &&
    b.payment_days_to_first_due !== null
  ) {
    const v = coerceSalesOrderInt(b.payment_days_to_first_due, -1);
    if (v < 0) return apiError("payment_days_to_first_due inválido", 400);
    updateData.payment_days_to_first_due = v;
  }
  if (b.payment_days_between_installments !== undefined) {
    updateData.payment_days_between_installments = parsePaymentDaysBetween(
      b.payment_days_between_installments
    );
  }

  const parseMoney = (v: unknown, _label: string): number | null => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  if (b.po_number !== undefined) {
    const n = typeof b.po_number === "string" ? b.po_number.trim() : "";
    if (!n) return apiError("Número do pedido inválido", 400);
    updateData.po_number = n;
  }
  if (b.supplier_id !== undefined) {
    if (b.supplier_id === null) {
      updateData.supplier_id = null;
    } else {
      const sid = String(b.supplier_id);
      const { data: sup } = await admin
        .from("suppliers")
        .select("id")
        .eq("id", sid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!sup) return apiError("Fornecedor inválido", 400);
      updateData.supplier_id = sid;
    }
  }
  if (b.order_date !== undefined) {
    if (b.order_date === null)
      return apiError("order_date não pode ser nulo", 400);
    const d = String(b.order_date).slice(0, 10);
    if (!d) return apiError("order_date inválido", 400);
    updateData.order_date = d;
  }
  if (b.expected_delivery !== undefined) {
    updateData.expected_delivery =
      b.expected_delivery === null
        ? null
        : String(b.expected_delivery).slice(0, 10);
  }
  if (b.actual_delivery !== undefined) {
    updateData.actual_delivery =
      b.actual_delivery === null
        ? null
        : String(b.actual_delivery).slice(0, 10);
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes === null ? null : String(b.notes).trim() || null;
  }
  if (b.internal_notes !== undefined) {
    updateData.internal_notes =
      b.internal_notes === null
        ? null
        : String(b.internal_notes).trim() || null;
  }
  if (b.subtotal !== undefined) {
    const v =
      typeof b.subtotal === "number"
        ? b.subtotal
        : parseFloat(String(b.subtotal));
    if (!Number.isFinite(v) || v < 0)
      return apiError("Subtotal inválido", 400);
    updateData.subtotal = v;
  }
  if (b.discount !== undefined) {
    const v =
      typeof b.discount === "number"
        ? b.discount
        : parseFloat(String(b.discount));
    if (!Number.isFinite(v) || v < 0)
      return apiError("Desconto inválido", 400);
    updateData.discount = v;
  }
  if (b.tax !== undefined) {
    const v =
      typeof b.tax === "number" ? b.tax : parseFloat(String(b.tax));
    if (!Number.isFinite(v) || v < 0) return apiError("Imposto inválido", 400);
    updateData.tax = v;
  }
  if (b.freight_cost !== undefined) {
    const v = parseMoney(b.freight_cost, "freight_cost");
    if (v === null) return apiError("Frete inválido", 400);
    updateData.freight_cost = v;
  }
  if (b.insurance_cost !== undefined) {
    const v = parseMoney(b.insurance_cost, "insurance_cost");
    if (v === null) return apiError("Seguro inválido", 400);
    updateData.insurance_cost = v;
  }
  if (b.other_costs !== undefined) {
    const v = parseMoney(b.other_costs, "other_costs");
    if (v === null) return apiError("Outros custos inválidos", 400);
    updateData.other_costs = v;
  }
  if (b.total_tax_non_creditable !== undefined) {
    const v = parseMoney(b.total_tax_non_creditable, "total_tax_non_creditable");
    if (v === null) return apiError("Impostos não creditáveis inválidos", 400);
    updateData.total_tax_non_creditable = v;
  }
  if (b.total !== undefined) {
    const v =
      typeof b.total === "number" ? b.total : parseFloat(String(b.total));
    if (!Number.isFinite(v) || v < 0) return apiError("Total inválido", 400);
    updateData.total = v;
  }
  if (b.requested_by !== undefined) {
    updateData.requested_by =
      b.requested_by === null ? null : String(b.requested_by);
  }
  if (b.approved_by !== undefined) {
    updateData.approved_by =
      b.approved_by === null ? null : String(b.approved_by);
  }
  if (b.approved_at !== undefined) {
    updateData.approved_at =
      b.approved_at === null ? null : String(b.approved_at);
  }

  let transitioningToReceived = false;
  if (b.status !== undefined) {
    const st = String(b.status);
    if (!PO_STATUSES.has(st)) return apiError("Status inválido", 400);
    updateData.status = st;
    if (st === "received") {
      if (existingOrder.status === "received") {
        return apiError("Pedido já foi recebido.", 409);
      }
      if (existingOrder.status === "cancelled") {
        return apiError("Pedido cancelado não pode ser recebido.", 400);
      }
      transitioningToReceived = true;
      updateData.actual_delivery = new Date().toISOString().slice(0, 10);
    }
  }

  const mergedForTotal = {
    subtotal:
      updateData.subtotal !== undefined
        ? updateData.subtotal
        : num(existingOrder.subtotal),
    discount:
      updateData.discount !== undefined
        ? updateData.discount
        : num(existingOrder.discount),
    tax:
      updateData.tax !== undefined ? updateData.tax : num(existingOrder.tax),
    total_icms:
      updateData.total_icms !== undefined
        ? updateData.total_icms
        : num(existingOrder.total_icms),
    total_ipi:
      updateData.total_ipi !== undefined
        ? updateData.total_ipi
        : num(existingOrder.total_ipi),
    total_tax_base:
      updateData.total_tax_base !== undefined
        ? updateData.total_tax_base
        : num(existingOrder.total_tax_base),
    freight_cost:
      updateData.freight_cost !== undefined
        ? updateData.freight_cost
        : num(existingOrder.freight_cost),
    insurance_cost:
      updateData.insurance_cost !== undefined
        ? updateData.insurance_cost
        : num(existingOrder.insurance_cost),
    other_costs:
      updateData.other_costs !== undefined
        ? updateData.other_costs
        : num(existingOrder.other_costs),
    total_tax_non_creditable:
      updateData.total_tax_non_creditable !== undefined
        ? updateData.total_tax_non_creditable
        : num(existingOrder.total_tax_non_creditable),
  };

  const extrasTouched =
    b.freight_cost !== undefined ||
    b.insurance_cost !== undefined ||
    b.other_costs !== undefined ||
    b.total_tax_non_creditable !== undefined ||
    b.subtotal !== undefined ||
    b.discount !== undefined ||
    b.tax !== undefined ||
    b.items !== undefined;

  if (extrasTouched && b.total === undefined) {
    updateData.total = computePurchaseOrderTotal(mergedForTotal);
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  if (
    existingOrder.status === "received" &&
    (b.freight_cost !== undefined ||
      b.insurance_cost !== undefined ||
      b.other_costs !== undefined ||
      b.total_tax_non_creditable !== undefined)
  ) {
    if (!(await isCurrentUserTenantAdmin())) {
      return apiError("Acesso negado", 403);
    }
    return apiError(
      "Custos adicionais não podem ser alterados após o recebimento.",
      400
    );
  }

  const { data, error } = await admin
    .from("purchase_orders")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Número de pedido já existe", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar pedido: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Pedido não encontrado", 404);

  if (transitioningToReceived) {
    try {
      const receive = await applyPurchaseOrderReceive(admin, tenantId, id);
      const { data: detail } = await admin
        .from("purchase_orders")
        .select(ORDER_DETAIL_SELECT)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return apiOk({ data: detail ?? data, receive });
    } catch (err) {
      return apiError(
        err instanceof Error
          ? err.message
          : "Erro ao ratear custos no recebimento.",
        500
      );
    }
  }

  const { data: detail, error: detailErr } = await admin
    .from("purchase_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (detailErr) {
    return apiError(
      "Pedido actualizado, mas falhou ao recarregar: " + detailErr.message,
      500
    );
  }

  return apiOk({ data: detail ?? data });
}
