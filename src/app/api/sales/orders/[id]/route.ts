import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { SALES_ORDER_STATUSES, type SalesOrderUpdate } from "@/modules/core/types/sales.types";
import {
  coerceSalesOrderInt,
  parseExpectedDeliveryForUpdate,
  parsePaymentDaysBetween,
} from "@/shared/contracts/sales-order.schema";
import {
  assertUpdateAllowedWhenProductionStarted,
  bodyWantsSalesOrderContentEdit,
  getSalesOrderEditGuard,
  replaceSalesOrderItemsFromLines,
  resolveCustomerForSalesOrderUpdate,
} from "@/modules/vendas/lib/sales/sales-order-edit";
import {
  buildItemChangeLogEntries,
  buildScalarChangeLogs,
  fetchSalesOrderItemsSnapshot,
  insertSalesOrderLogsBestEffort,
  type SalesOrderItemSnapshot,
} from "@/modules/vendas/lib/sales/sales-order-change-log";
import { parseSaleLines } from "@/modules/vendas/lib/sales/sales-flow";
import {
  hardDeleteSalesOrder,
  salesOrderHasAssociatedOrderItems,
} from "@/modules/vendas/lib/sales/delete-sales-order";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const SO_SET = new Set<string>(SALES_ORDER_STATUSES);

const ORDER_DETAIL_SELECT = `
  *,
  items:sales_order_items(
    *,
    product:products!sales_order_items_product_id_fkey(*)
  ),
  quote:quotes!sales_orders_quote_id_fkey(
    *,
    customer:customers(id, name, document, email, phone, address)
  ),
  production_order:production_orders!sales_orders_production_order_id_fkey(*),
  nfes(*)
`.trim();

type SalesOrderDetailRow = {
  id: string;
  mrp_processed: boolean | null;
  production_order_id: string | null;
  [key: string]: unknown;
};

function asSalesOrderDetail(raw: unknown): SalesOrderDetailRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return row as SalesOrderDetailRow;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("sales_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar pedido de venda: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  const detail = asSalesOrderDetail(data);
  if (!detail) return apiError("Pedido não encontrado", 404);

  const edit_guard = await getSalesOrderEditGuard(admin, tenantId, {
    id: detail.id,
    mrp_processed: detail.mrp_processed === true,
    production_order_id:
      typeof detail.production_order_id === "string"
        ? detail.production_order_id
        : null,
  });

  return apiOk({ data: { ...detail, edit_guard } });
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
  const canSales = await currentUserCanModule("sales");
  const canPcp =
    isAdmin ||
    (await currentUserCanModule("mrp")) ||
    (await currentUserCanModule("production"));

  const wantsCommercial =
    b.expected_delivery !== undefined ||
    b.payment_installments !== undefined ||
    b.payment_days_to_first_due !== undefined ||
    b.payment_days_between_installments !== undefined;

  const wantsPcp = b.pcp_deadline !== undefined;
  const wantsProductionLink = b.production_order_id !== undefined;

  if (wantsCommercial && !isAdmin && !canSales) {
    return apiError("Sem permissão para alterar dados comerciais", 403);
  }
  if ((wantsPcp || wantsProductionLink) && !canPcp) {
    return apiError("Sem permissão para alterar planejamento interno", 403);
  }

  if (bodyWantsSalesOrderContentEdit(b) && !isAdmin && !canSales) {
    return apiError("Sem permissão para alterar pedidos de venda", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: existingRow, error: loadErr } = await admin
    .from("sales_orders")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar pedido: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }
  if (!existingRow) return apiError("Pedido não encontrado", 404);

  const existing = existingRow as Record<string, unknown>;

  if (existing.status === "cancelled") {
    return apiError("Pedido cancelado não pode ser alterado", 409);
  }

  const editGuard = await getSalesOrderEditGuard(admin, tenantId, {
    id: String(existing.id),
    mrp_processed: existing.mrp_processed === true,
    production_order_id:
      typeof existing.production_order_id === "string"
        ? existing.production_order_id
        : null,
  });

  const updateData: SalesOrderUpdate = {};
  let customerResolved = false;

  if (b.order_number !== undefined) {
    const n = typeof b.order_number === "string" ? b.order_number.trim() : "";
    if (!n) return apiError("Número do pedido inválido", 400);
    updateData.order_number = n;
  }
  if (b.client_name !== undefined) {
    const n =
      typeof b.client_name === "string" ? b.client_name.trim() : "";
    if (!n) return apiError("Nome do cliente inválido", 400);
    updateData.client_name = n;
  }
  if (b.client_document !== undefined) {
    updateData.client_document =
      b.client_document === null
        ? null
        : String(b.client_document).trim() || null;
  }
  if (b.client_email !== undefined) {
    updateData.client_email =
      b.client_email === null ? null : String(b.client_email).trim() || null;
  }
  if (b.client_phone !== undefined) {
    updateData.client_phone =
      b.client_phone === null ? null : String(b.client_phone).trim() || null;
  }
  if (b.client_address !== undefined) {
    updateData.client_address =
      b.client_address === null
        ? null
        : String(b.client_address).trim() || null;
  }
  if (b.order_date !== undefined) {
    if (b.order_date === null) return apiError("order_date não pode ser nulo", 400);
    updateData.order_date = String(b.order_date).slice(0, 10);
  }
  if (b.expected_delivery !== undefined) {
    const expectedParsed = parseExpectedDeliveryForUpdate(
      b.expected_delivery
    );
    if (!expectedParsed.ok) {
      return apiError(expectedParsed.message, 400);
    }
    updateData.expected_delivery = expectedParsed.value;
  }
  if (b.pcp_deadline !== undefined) {
    updateData.pcp_deadline =
      b.pcp_deadline === null
        ? null
        : String(b.pcp_deadline).slice(0, 10);
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
  if (b.quote_id !== undefined) {
    if (b.quote_id === null) updateData.quote_id = null;
    else {
      const qid = String(b.quote_id);
      const { data: q } = await admin
        .from("quotes")
        .select("id")
        .eq("id", qid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!q) return apiError("Orçamento inválido", 400);
      updateData.quote_id = qid;
    }
  }
  if (b.production_order_id !== undefined) {
    if (b.production_order_id === null) updateData.production_order_id = null;
    else {
      const pid = String(b.production_order_id);
      const { data: po } = await admin
        .from("production_orders")
        .select("id")
        .eq("id", pid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!po) return apiError("Ordem de produção inválida", 400);
      updateData.production_order_id = pid;
    }
  }
  if (b.discount !== undefined) {
    const v =
      typeof b.discount === "number"
        ? b.discount
        : parseFloat(String(b.discount));
    if (!Number.isFinite(v) || v < 0) return apiError("Desconto inválido", 400);
    updateData.discount = v;
  }
  if (b.tax !== undefined) {
    const v =
      typeof b.tax === "number" ? b.tax : parseFloat(String(b.tax));
    if (!Number.isFinite(v) || v < 0) return apiError("Imposto inválido", 400);
    updateData.tax = v;
  }
  if (b.subtotal !== undefined) {
    const v =
      typeof b.subtotal === "number"
        ? b.subtotal
        : parseFloat(String(b.subtotal));
    if (!Number.isFinite(v) || v < 0) return apiError("Subtotal inválido", 400);
    updateData.subtotal = v;
  }
  if (b.total !== undefined) {
    const v =
      typeof b.total === "number" ? b.total : parseFloat(String(b.total));
    if (!Number.isFinite(v) || v < 0) return apiError("Total inválido", 400);
    updateData.total = v;
  }
  if (b.status !== undefined) {
    const st = String(b.status);
    if (!SO_SET.has(st)) return apiError("Status inválido", 400);
    if (st === "cancelled" && editGuard.production_started) {
      return apiError(
        "Pedido já teve produção iniciada e não pode ser cancelado.",
        400
      );
    }
    updateData.status = st;
  }

  if (b.customer_id !== undefined) {
    if (!isAdmin && !canSales) {
      return apiError("Sem permissão para alterar dados comerciais", 403);
    }
    const cid =
      b.customer_id === null ? "" : String(b.customer_id).trim();
    if (!cid) return apiError("Cliente é obrigatório", 400);
    const cust = await resolveCustomerForSalesOrderUpdate(
      admin,
      tenantId,
      cid
    );
    if (!cust.ok) return apiError(cust.message, 400);
    updateData.client_name = cust.client_name;
    updateData.client_document = cust.client_document;
    updateData.client_email = cust.client_email;
    updateData.client_phone = cust.client_phone;
    updateData.client_address = cust.client_address;
    customerResolved = true;
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

  let itemsReplaced = false;
  let oldItemsSnapshot: SalesOrderItemSnapshot[] | null = null;
  let newItemsSnapshot: SalesOrderItemSnapshot[] | null = null;

  if (b.items !== undefined) {
    if (!editGuard.can_edit_items) {
      return apiError(
        existing.mrp_processed === true
          ? "Pedido já processado pelo MRP. Não é possível alterar os itens."
          : "Produção já iniciada. Não é possível alterar os itens.",
        409
      );
    }
    if (!isAdmin && !canSales) {
      return apiError("Sem permissão para alterar itens do pedido", 403);
    }
    const parsedLines = parseSaleLines(b.items);
    if (!parsedLines.ok) return apiError(parsedLines.message, 400);

    oldItemsSnapshot = await fetchSalesOrderItemsSnapshot(
      admin,
      tenantId,
      id
    );
    newItemsSnapshot = parsedLines.lines.map((l) => ({
      product_id: l.product_id ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      unit: l.unit ?? "UN",
    }));

    const itemsProductionCheck = assertUpdateAllowedWhenProductionStarted(
      {},
      { itemsReplaced: true, customerResolved: false },
      editGuard.production_started
    );
    if (!itemsProductionCheck.ok) {
      return apiError(itemsProductionCheck.message, 409);
    }

    const itemErr = await replaceSalesOrderItemsFromLines(
      admin,
      tenantId,
      id,
      parsedLines.lines
    );
    if (itemErr.error) return apiError(itemErr.error, 400);
    itemsReplaced = true;
  }

  const finalProductionCheck = assertUpdateAllowedWhenProductionStarted(
    updateData,
    { itemsReplaced, customerResolved },
    editGuard.production_started
  );
  if (!finalProductionCheck.ok) {
    return apiError(finalProductionCheck.message, 409);
  }

  if (Object.keys(updateData).length === 0 && !itemsReplaced) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const scalarLogs = buildScalarChangeLogs(existing, updateData).map((e) => ({
    ...e,
    tenant_id: tenantId,
    sales_order_id: id,
    changed_by: user.id,
  }));

  const itemLogEntries =
    itemsReplaced && oldItemsSnapshot && newItemsSnapshot
      ? buildItemChangeLogEntries(oldItemsSnapshot, newItemsSnapshot)
      : [];

  const logEntries = [
    ...scalarLogs.map(({ field_name, old_value, new_value, notes }) => ({
      field_name,
      old_value,
      new_value,
      notes,
    })),
    ...itemLogEntries,
  ];

  if (Object.keys(updateData).length > 0) {
    const { data, error } = await admin
      .from("sales_orders")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error?.code === "23505") {
      return apiError("Número do pedido já existe", 409);
    }
    if (error) {
      return apiError(
        "Erro ao atualizar pedido: " + error.message,
        supabaseErrorToHttp(error.code)
      );
    }
    if (!data) return apiError("Pedido não encontrado", 404);
  }

  if (logEntries.length) {
    await insertSalesOrderLogsBestEffort(
      admin,
      tenantId,
      id,
      user.id,
      logEntries
    );
  }

  if (updateData.pcp_deadline !== undefined) {
    const pcpVal = updateData.pcp_deadline as string | null;
    await admin
      .from("sales_order_items")
      .update({ pcp_deadline: pcpVal })
      .eq("sales_order_id", id)
      .eq("tenant_id", tenantId);

    const { data: soiRows } = await admin
      .from("sales_order_items")
      .select("id")
      .eq("sales_order_id", id)
      .eq("tenant_id", tenantId);
    const soiIds = (soiRows ?? []).map((r) => r.id);
    if (soiIds.length) {
      await admin
        .from("order_items")
        .update({ pcp_deadline: pcpVal })
        .eq("tenant_id", tenantId)
        .in("sales_order_item_id", soiIds);
    }
  }

  const { data: detail, error: dErr } = await admin
    .from("sales_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const detailRow = asSalesOrderDetail(detail);
  if (dErr || !detailRow) return apiOk({ data: detail });

  const guard = await getSalesOrderEditGuard(admin, tenantId, {
    id: detailRow.id,
    mrp_processed: detailRow.mrp_processed === true,
    production_order_id:
      typeof detailRow.production_order_id === "string"
        ? detailRow.production_order_id
        : null,
  });
  return apiOk({ data: { ...detailRow, edit_guard: guard } });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: order, error: fetchErr } = await admin
    .from("sales_orders")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) {
    return apiError(
      "Erro ao buscar pedido: " + fetchErr.message,
      supabaseErrorToHttp(fetchErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  try {
    const hasProduction = await salesOrderHasAssociatedOrderItems(
      admin,
      tenantId,
      id
    );
    if (hasProduction) {
      return apiError(
        "Este pedido possui produção associada (itens de ordem de produção) e não pode ser excluído. Remova o planeamento em PCP antes de tentar novamente.",
        409
      );
    }

    await hardDeleteSalesOrder(admin, tenantId, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir pedido";
    return apiError(msg, 500);
  }

  return apiOk({ success: true });
}
