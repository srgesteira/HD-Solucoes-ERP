import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("production_lines")
    .select("id, code, name, sort_order, is_active, description")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar linha de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Linha de produção não encontrada", 404);
  if (!data.is_active) {
    return apiError("Linha de produção inactiva", 404);
  }

  return apiOk({ data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

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

  const updateData: Database["public"]["Tables"]["production_lines"]["Update"] =
    {};

  if (b.code !== undefined) {
    if (typeof b.code !== "string" || !b.code.trim()) {
      return apiError("Código inválido", 400);
    }
    updateData.code = b.code.trim().toUpperCase();
  }
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim()) {
      return apiError("Nome inválido", 400);
    }
    updateData.name = b.name.trim();
  }
  if (b.sort_order !== undefined) {
    updateData.sort_order =
      typeof b.sort_order === "number"
        ? b.sort_order
        : parseInt(String(b.sort_order), 10) || 0;
  }
  if (b.description !== undefined) {
    updateData.description =
      b.description === null ? null : String(b.description);
  }
  if (b.is_active !== undefined) {
    updateData.is_active = Boolean(b.is_active);
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("production_lines")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Já existe uma linha com este código", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar linha de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Linha de produção não encontrada", 404);

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("production_lines")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao desativar linha de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!updated) return apiError("Linha de produção não encontrada", 404);

  return apiOk({ success: true });
}
