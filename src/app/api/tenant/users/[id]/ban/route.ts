import type { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  active: z.boolean(),
});

type Ctx = { params: Promise<{ id: string }> };

const PERMANENT_BAN_DURATION = "876000h"; // ~100 anos (na prática: até reativar manualmente)

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id: targetUserId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem suspender/reativar.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError("Dados inválidos", 400);

  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, tenant_id, role")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!profile || profile.tenant_id !== tenantId) {
    return apiError("Utilizador não encontrado neste tenant.", 404);
  }
  if (profile.role === "admin") {
    return apiError("Não é permitido suspender um administrador.", 403);
  }

  const active = parsed.data.active === true;
  const ban_duration = active ? "none" : PERMANENT_BAN_DURATION;

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration,
  });
  if (error) return apiError(error.message, 400);

  await admin
    .from("user_profiles")
    .update({ is_active: active })
    .eq("id", targetUserId)
    .eq("tenant_id", tenantId);

  return apiOk({ id: targetUserId, active, ban_duration });
}

