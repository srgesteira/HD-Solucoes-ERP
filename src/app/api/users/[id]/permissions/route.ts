import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { userPermissionsUpdateSchema } from "@/lib/schemas/user-permissions.schema";
import {
  DEFAULT_MODULE_PERMISSIONS,
  mergeModulePermissions,
  type ModulePermissions,
} from "@/lib/permissions";
import type { Json } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id: targetUserId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem alterar permissões.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = userPermissionsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const { data: target, error: loadErr } = await admin
    .from("user_profiles")
    .select("id, tenant_id, role, permissions")
    .eq("id", targetUserId)
    .maybeSingle();

  if (loadErr) {
    return apiError("Erro ao carregar utilizador: " + loadErr.message, 500);
  }
  if (!target || target.tenant_id !== tenantId) {
    return apiError("Utilizador não encontrado neste tenant.", 404);
  }
  if (target.role === "admin") {
    return apiError(
      "Não é permitido alterar permissões de outro administrador.",
      403
    );
  }

  const current = mergeModulePermissions(target.permissions as Json);
  const next: ModulePermissions = { ...DEFAULT_MODULE_PERMISSIONS, ...current };
  for (const [k, v] of Object.entries(parsed.data.permissions)) {
    if (v === undefined) continue;
    if (typeof v === "boolean" && k in next) {
      (next as Record<string, boolean>)[k] = v;
    }
  }

  const { data: updated, error: upErr } = await admin
    .from("user_profiles")
    .update({ permissions: next as unknown as Json })
    .eq("id", targetUserId)
    .eq("tenant_id", tenantId)
    .select("id, permissions")
    .maybeSingle();

  if (upErr || !updated) {
    return apiError(
      "Erro ao gravar permissões: " + (upErr?.message ?? "desconhecido"),
      500
    );
  }

  return apiOk({
    id: updated.id,
    permissions: mergeModulePermissions(updated.permissions as Json),
  });
}
