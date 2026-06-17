import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const update: Record<string, unknown> = {};
  const fields = [
    "name",
    "description",
    "priority",
    "is_active",
    "valid_from",
    "valid_until",
    "notes",
    "operation_type",
    "origin_uf",
    "destination_uf",
    "tax_regime_id",
    "company_tax_regime",
    "ncm_pattern",
    "product_prefix_code",
    "product_nature",
    "cfop",
    "icms_rate",
    "icms_st",
    "icms_st_rate",
    "ipi_rate",
    "pis_rate",
    "cofins_rate",
    "cbs_rate",
    "ibs_rate",
    "ibs_cbs_classificacao",
  ] as const;

  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  const { data, error } = await db
    .from("fiscal_rules")
    .update(update as Database["public"]["Tables"]["fiscal_rules"]["Update"])
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }
  if (!data) return apiError("Regra não encontrada", 404);

  return apiOk({ rule: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const { error } = await db
    .from("fiscal_rules")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ ok: true });
}
