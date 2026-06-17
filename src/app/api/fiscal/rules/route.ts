import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { listFiscalRules } from "@/modules/fiscal/lib/fiscal-rules-service";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const admin = createSupabaseAdminClient();
    const rules = await listFiscalRules(admin, tenantId);
    return apiOk({ rules });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar regras",
      supabaseErrorToHttp(null)
    );
  }
}

export async function POST(request: NextRequest) {
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return apiError("Nome é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const { asUntypedAdmin } = await import("@/shared/db/supabase/untyped-tables");
  const db = asUntypedAdmin(admin);

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    name,
    description: typeof body.description === "string" ? body.description : null,
    priority: typeof body.priority === "number" ? body.priority : 100,
    is_active: body.is_active !== false,
    valid_from: body.valid_from ?? null,
    valid_until: body.valid_until ?? null,
    notes: typeof body.notes === "string" ? body.notes : null,
    operation_type: body.operation_type ?? null,
    origin_uf: body.origin_uf ?? null,
    destination_uf: body.destination_uf ?? null,
    tax_regime_id: body.tax_regime_id ?? null,
    company_tax_regime: body.company_tax_regime ?? null,
    ncm_pattern: body.ncm_pattern ?? null,
    product_prefix_code: body.product_prefix_code ?? null,
    product_nature: body.product_nature ?? null,
    cfop: body.cfop ?? null,
    icms_rate: body.icms_rate ?? null,
    icms_st: body.icms_st ?? null,
    icms_st_rate: body.icms_st_rate ?? null,
    ipi_rate: body.ipi_rate ?? null,
    pis_rate: body.pis_rate ?? null,
    cofins_rate: body.cofins_rate ?? null,
    cbs_rate: body.cbs_rate ?? null,
    ibs_rate: body.ibs_rate ?? null,
    ibs_cbs_classificacao: body.ibs_cbs_classificacao ?? null,
    created_by: user.id,
  };

  const { data, error } = await db
    .from("fiscal_rules")
    .insert(payload as Database["public"]["Tables"]["fiscal_rules"]["Insert"])
    .select("*")
    .single();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ rule: data }, 201);
}
