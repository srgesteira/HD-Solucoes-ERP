import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { QUOTE_STATUSES, type QuoteUpdate } from "@/lib/types/sales.types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const QUOTE_SET = new Set<string>(QUOTE_STATUSES);

const QUOTE_DETAIL_SELECT = `
  *,
  items:quote_items(
    *,
    product:products!quote_items_product_id_fkey(*)
  ),
  converted_sale:sales_orders!quotes_converted_to_sale_fk(*),
  created_by_user:user_profiles!quotes_created_by_fkey(id, full_name, email)
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
    .from("quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar orçamento: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Orçamento não encontrado", 404);

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
  const updateData: QuoteUpdate = {};

  if (b.client_name !== undefined) {
    const n = typeof b.client_name === "string" ? b.client_name.trim() : "";
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
  if (b.quote_date !== undefined) {
    if (b.quote_date === null) return apiError("quote_date não pode ser nulo", 400);
    updateData.quote_date = String(b.quote_date).slice(0, 10);
  }
  if (b.valid_until !== undefined) {
    updateData.valid_until =
      b.valid_until === null ? null : String(b.valid_until).slice(0, 10);
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes === null ? null : String(b.notes).trim() || null;
  }
  if (b.quote_number !== undefined) {
    const n = typeof b.quote_number === "string" ? b.quote_number.trim() : "";
    if (!n) return apiError("Número do orçamento inválido", 400);
    updateData.quote_number = n;
  }
  if (b.status !== undefined) {
    const st = String(b.status);
    if (!QUOTE_SET.has(st)) return apiError("Status inválido", 400);
    updateData.status = st;
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
  if (b.bdi_percentage !== undefined) {
    updateData.bdi_percentage =
      b.bdi_percentage === null
        ? null
        : typeof b.bdi_percentage === "number"
          ? b.bdi_percentage
          : parseFloat(String(b.bdi_percentage));
  }
  if (b.bdi_value !== undefined) {
    updateData.bdi_value =
      b.bdi_value === null
        ? null
        : typeof b.bdi_value === "number"
          ? b.bdi_value
          : parseFloat(String(b.bdi_value));
  }
  if (b.base_cost !== undefined) {
    updateData.base_cost =
      b.base_cost === null
        ? null
        : typeof b.base_cost === "number"
          ? b.base_cost
          : parseFloat(String(b.base_cost));
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const { data, error } = await admin
    .from("quotes")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Número do orçamento já existe", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar orçamento: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Orçamento não encontrado", 404);

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: deleted, error } = await admin
    .from("quotes")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao excluir orçamento: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!deleted) return apiError("Orçamento não encontrado", 404);

  return apiOk({ success: true });
}
