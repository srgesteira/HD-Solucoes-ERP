import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar cliente: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Cliente não encontrado", 404);

  return apiOk({ data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

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

  const updateData: CustomerUpdate = {};

  if (b.name !== undefined) {
    const n = typeof b.name === "string" ? b.name.trim() : "";
    if (!n) return apiError("Nome inválido", 400);
    updateData.name = n;
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
  if (b.address !== undefined) {
    updateData.address =
      b.address == null ? null : String(b.address).trim() || null;
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes == null ? null : String(b.notes).trim() || null;
  }
  if (b.is_active !== undefined) {
    updateData.is_active = Boolean(b.is_active);
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Já existe um cliente com este nome.", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar cliente: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Cliente não encontrado", 404);

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, is_active")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao desativar cliente: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Cliente não encontrado", 404);

  return apiOk({ data });
}
