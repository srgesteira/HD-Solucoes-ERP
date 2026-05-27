import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { workCenterSchema } from "@/shared/contracts/product.schema";
import { ensureProductionLineForWorkCenter } from "@/modules/producao/lib/production-line-sync";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** PUT — actualização (apenas admins do tenant). Corpo pode ser parcial. */
export async function PUT(request: NextRequest, { params }: Params) {
  const { id: centerId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

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

  const parsed = workCenterSchema.partial().safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const v = parsed.data;
  const updateRow: Database["public"]["Tables"]["work_centers"]["Update"] = {};

  if (v.code !== undefined) updateRow.code = v.code.trim().toUpperCase();
  if (v.name !== undefined) updateRow.name = v.name.trim();
  if (v.hourly_cost !== undefined) updateRow.hourly_cost = v.hourly_cost;
  if (v.default_monthly_hours !== undefined) {
    updateRow.default_monthly_hours = v.default_monthly_hours;
  }
  if (v.efficiency !== undefined) updateRow.efficiency = v.efficiency;
  if (v.description !== undefined) {
    updateRow.description = v.description ?? null;
  }
  if (v.is_active !== undefined) updateRow.is_active = v.is_active;

  if (Object.keys(updateRow).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("work_centers")
    .update(updateRow)
    .eq("id", centerId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Código duplicado para este tenant.", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar centro de trabalho: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Linha de produção não encontrada", 404);

  try {
    await ensureProductionLineForWorkCenter(admin, tenantId, {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      is_active: data.is_active,
    });
  } catch (syncErr) {
    return apiError(
      syncErr instanceof Error ? syncErr.message : "Erro ao sincronizar PCP",
      500
    );
  }

  return apiOk({ data });
}

/** DELETE — desactivação (soft delete). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: centerId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("work_centers")
    .update({ is_active: false })
    .eq("id", centerId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao remover centro de trabalho: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!updated) return apiError("Centro de trabalho não encontrado", 404);

  return apiOk({ success: true });
}
