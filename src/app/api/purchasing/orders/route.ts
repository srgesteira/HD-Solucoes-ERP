import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";

export const dynamic = "force-dynamic";

const LIST_SELECT = `
  *,
  supplier:suppliers(*)
`.trim();

const PO_STATUSES = new Set([
  "draft",
  "sent",
  "confirmed",
  "partial",
  "received",
  "cancelled",
]);

/** Escapa `%` e `_` para `.ilike`. */
function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplier_id");
  const search = searchParams.get("search")?.trim();
  const page = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10) || 25)
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("purchase_orders")
    .select(LIST_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (status && status !== "all") {
    if (!PO_STATUSES.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (supplierId?.trim()) {
    query = query.eq("supplier_id", supplierId.trim());
  }

  if (search) {
    const safe = `%${escapeIlike(search)}%`;
    query = query.ilike("po_number", safe);
  }

  const { data, error, count } = await query
    .order("order_date", { ascending: false })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar pedidos de compra: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  });
}

export async function POST(request: NextRequest) {
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

  const po_number =
    typeof b.po_number === "string" ? b.po_number.trim() : "";
  if (!po_number) {
    return apiError("Número do pedido é obrigatório", 400);
  }

  const supplier_id =
    b.supplier_id === undefined || b.supplier_id === null
      ? null
      : String(b.supplier_id);

  const order_date =
    b.order_date === undefined || b.order_date === null
      ? new Date().toISOString().slice(0, 10)
      : String(b.order_date).slice(0, 10);

  const expected_delivery =
    b.expected_delivery === undefined || b.expected_delivery === null
      ? null
      : String(b.expected_delivery).slice(0, 10);

  const notes =
    b.notes === undefined || b.notes === null
      ? null
      : String(b.notes).trim() || null;

  const admin = createSupabaseAdminClient();

  if (supplier_id) {
    const { data: sup } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", supplier_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!sup) return apiError("Fornecedor inválido", 400);
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await admin
    .from("purchase_orders")
    .insert({
      tenant_id: tenantId,
      po_number,
      supplier_id,
      order_date,
      expected_delivery,
      notes,
      status: "draft",
      requested_by: profile?.id ?? null,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError("Número de pedido já existe", 409);
  }
  if (error) {
    return apiError(
      "Erro ao criar pedido de compra: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
