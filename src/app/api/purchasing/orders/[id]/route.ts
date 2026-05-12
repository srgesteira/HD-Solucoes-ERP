import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import type { Database } from "@/lib/types/database";

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
  const updateData: PurchaseOrderUpdate = {};

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

  if (b.status !== undefined) {
    const st = String(b.status);
    if (!PO_STATUSES.has(st)) return apiError("Status inválido", 400);
    updateData.status = st;
    if (st === "received") {
      updateData.actual_delivery = new Date().toISOString().slice(0, 10);
    }
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
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

  return apiOk({ data });
}
