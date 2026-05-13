import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { SALES_ORDER_STATUSES, type SalesOrderUpdate } from "@/lib/types/sales.types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const SO_SET = new Set<string>(SALES_ORDER_STATUSES);

const ORDER_DETAIL_SELECT = `
  *,
  items:sales_order_items(
    *,
    product:products!sales_order_items_product_id_fkey(*)
  ),
  quote:quotes!sales_orders_quote_id_fkey(*),
  production_order:production_orders!sales_orders_production_order_id_fkey(*),
  nfes(*)
`.trim();

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
  if (!data) return apiError("Pedido não encontrado", 404);

  return apiOk({ data });
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

  const admin = createSupabaseAdminClient();
  const updateData: SalesOrderUpdate = {};

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
    updateData.expected_delivery =
      b.expected_delivery === null
        ? null
        : String(b.expected_delivery).slice(0, 10);
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
    updateData.status = st;
  }

  if (b.payment_installments !== undefined && b.payment_installments !== null) {
    const v =
      typeof b.payment_installments === "number"
        ? b.payment_installments
        : parseInt(String(b.payment_installments), 10);
    if (!Number.isFinite(v) || v < 1)
      return apiError("payment_installments inválido", 400);
    updateData.payment_installments = v;
  }
  if (
    b.payment_days_to_first_due !== undefined &&
    b.payment_days_to_first_due !== null
  ) {
    const v =
      typeof b.payment_days_to_first_due === "number"
        ? b.payment_days_to_first_due
        : parseInt(String(b.payment_days_to_first_due), 10);
    if (!Number.isFinite(v) || v < 0)
      return apiError("payment_days_to_first_due inválido", 400);
    updateData.payment_days_to_first_due = v;
  }
  if (
    b.payment_days_between_installments !== undefined &&
    b.payment_days_between_installments !== null
  ) {
    const v =
      typeof b.payment_days_between_installments === "number"
        ? b.payment_days_between_installments
        : parseInt(String(b.payment_days_between_installments), 10);
    if (!Number.isFinite(v) || v < 0)
      return apiError(
        "payment_days_between_installments inválido",
        400
      );
    updateData.payment_days_between_installments = v;
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

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

  const { data: detail, error: dErr } = await admin
    .from("sales_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (dErr || !detail) return apiOk({ data });
  return apiOk({ data: detail });
}
