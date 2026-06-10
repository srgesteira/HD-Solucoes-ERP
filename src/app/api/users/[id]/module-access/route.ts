import type { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  APP_MODULE_KEYS,
  unionRoleModuleKeys,
} from "@/shared/auth/menu-modules";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  enabled_modules: z.array(z.string()).optional(),
  role_key: z.string().trim().optional(),
  admin_all: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id: targetUserId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem alterar acesso.", 403);
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
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const { data: target, error: loadErr } = await admin
    .from("user_profiles")
    .select("id, tenant_id, role")
    .eq("id", targetUserId)
    .maybeSingle();

  if (loadErr) {
    return apiError("Erro ao carregar utilizador: " + loadErr.message, 500);
  }
  if (!target || target.tenant_id !== tenantId) {
    return apiError("Utilizador não encontrado neste tenant.", 404);
  }
  if (target.role === "admin") {
    return apiError("Não é permitido alterar outro administrador.", 403);
  }

  let enabled_modules = parsed.data.enabled_modules;
  let role_keys: string[] | null = null;

  let role: string | undefined;

  if (parsed.data.admin_all) {
    enabled_modules = ["*"];
    role_keys = [];
    role = "admin";
  } else if (parsed.data.role_key) {
    const db = asUntypedAdmin(admin);
    const { data: roleRow, error: roleErr } = await db
      .from("role_permissions")
      .select("role_key, module_keys")
      .eq("role_key", parsed.data.role_key)
      .maybeSingle();

    if (roleErr || !roleRow) {
      return apiError("Cargo R2 não encontrado.", 404);
    }
    enabled_modules = unionRoleModuleKeys([roleRow]);
    role_keys = [roleRow.role_key];
    role = "user";
  } else if (parsed.data.enabled_modules) {
    role = "user";
  }

  if (!enabled_modules) {
    return apiError("Informe enabled_modules, role_key ou admin_all.", 400);
  }

  const valid = new Set(APP_MODULE_KEYS as readonly string[]);
  if (!enabled_modules.includes("*")) {
    const invalid = enabled_modules.filter((k) => !valid.has(k));
    if (invalid.length) {
      return apiError(`Módulos inválidos: ${invalid.join(", ")}`, 400);
    }
  }

  const db = asUntypedAdmin(admin);
  const { data: updated, error: upErr } = await db
    .from("user_profiles")
    .update({
      enabled_modules,
      role_keys: role_keys ?? undefined,
      ...(role ? { role } : {}),
    })
    .eq("id", targetUserId)
    .eq("tenant_id", tenantId)
    .select("id, enabled_modules, role_keys")
    .maybeSingle();

  if (upErr || !updated) {
    return apiError(
      "Erro ao gravar acesso: " + (upErr?.message ?? "desconhecido"),
      500
    );
  }

  return apiOk(updated);
}
