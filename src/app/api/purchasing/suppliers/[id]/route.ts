import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type SupplierUpdate = Database["public"]["Tables"]["suppliers"]["Update"];

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar fornecedor: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Fornecedor não encontrado", 404);

  return apiOk({ data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

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

  const updateData: SupplierUpdate = {};

  if (b.code !== undefined) {
    const c = typeof b.code === "string" ? b.code.trim() : "";
    if (!c) return apiError("Código inválido", 400);
    updateData.code = c.toUpperCase();
  }
  if (b.name !== undefined) {
    const n = typeof b.name === "string" ? b.name.trim() : "";
    if (!n) return apiError("Nome inválido", 400);
    updateData.name = n;
  }
  if (b.legal_name !== undefined) {
    updateData.legal_name =
      b.legal_name == null ? null : String(b.legal_name).trim() || null;
  }
  if (b.document !== undefined) {
    updateData.document =
      b.document == null ? null : String(b.document).trim() || null;
  }
  if (b.email !== undefined) {
    updateData.email =
      b.email == null ? null : String(b.email).trim() || null;
  }
  if (b.phone !== undefined) {
    updateData.phone =
      b.phone == null ? null : String(b.phone).trim() || null;
  }
  if (b.website !== undefined) {
    updateData.website =
      b.website == null ? null : String(b.website).trim() || null;
  }
  if (b.address_street !== undefined) {
    updateData.address_street =
      b.address_street == null
        ? null
        : String(b.address_street).trim() || null;
  }
  if (b.address_number !== undefined) {
    updateData.address_number =
      b.address_number == null
        ? null
        : String(b.address_number).trim() || null;
  }
  if (b.address_complement !== undefined) {
    updateData.address_complement =
      b.address_complement == null
        ? null
        : String(b.address_complement).trim() || null;
  }
  if (b.address_neighborhood !== undefined) {
    updateData.address_neighborhood =
      b.address_neighborhood == null
        ? null
        : String(b.address_neighborhood).trim() || null;
  }
  if (b.address_city !== undefined) {
    updateData.address_city =
      b.address_city == null ? null : String(b.address_city).trim() || null;
  }
  if (b.address_state !== undefined) {
    updateData.address_state =
      b.address_state == null ? null : String(b.address_state).trim() || null;
  }
  if (b.address_zip !== undefined) {
    updateData.address_zip =
      b.address_zip == null ? null : String(b.address_zip).trim() || null;
  }
  if (b.contact_person !== undefined) {
    updateData.contact_person =
      b.contact_person == null
        ? null
        : String(b.contact_person).trim() || null;
  }
  if (b.payment_terms !== undefined) {
    updateData.payment_terms =
      b.payment_terms == null
        ? null
        : String(b.payment_terms).trim() || null;
  }
  if (b.delivery_terms !== undefined) {
    updateData.delivery_terms =
      b.delivery_terms == null
        ? null
        : String(b.delivery_terms).trim() || null;
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes == null ? null : String(b.notes).trim() || null;
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== "boolean") {
      return apiError("is_active deve ser booleano", 400);
    }
    updateData.is_active = b.is_active;
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("suppliers")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Código já existe", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar fornecedor: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Fornecedor não encontrado", 404);

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("suppliers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao desativar fornecedor: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!updated) return apiError("Fornecedor não encontrado", 404);

  return apiOk({ success: true });
}
