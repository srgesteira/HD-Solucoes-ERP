import { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import type { Database } from "@/lib/types/database";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(32).optional(),
  is_support: z.boolean().optional(),
  allocation_driver: z
    .enum(["hours", "purchase_orders", "shipped_weight", "movements_count"])
    .optional(),
  driver_config: z.record(z.string(), z.unknown()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
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

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const v = parsed.data;
  type DeptUpdate = Database["public"]["Tables"]["departments"]["Update"];
  const update: DeptUpdate = {};
  if (v.name !== undefined) update.name = v.name.trim();
  if (v.code !== undefined) update.code = v.code.trim().toUpperCase();
  if (v.is_support !== undefined) update.is_support = v.is_support;
  if (v.allocation_driver !== undefined) {
    update.allocation_driver = v.allocation_driver;
  }
  if (v.driver_config !== undefined) {
    update.driver_config = v.driver_config as Database["public"]["Tables"]["departments"]["Update"]["driver_config"];
  }

  if (Object.keys(update).length === 0) {
    return apiError("Nada para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("departments")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ data });
}
