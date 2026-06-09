import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("pcp");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
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

  if (b.pcp_deadline === undefined) {
    return apiError("pcp_deadline é obrigatório", 400);
  }

  const pcpDeadline =
    b.pcp_deadline === null ? null : String(b.pcp_deadline).slice(0, 10);

  const admin = createSupabaseAdminClient();

  const { data: existing, error: loadErr } = await admin
    .from("production_orders")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .maybeSingle();

  if (loadErr) {
    return apiError(loadErr.message, supabaseErrorToHttp(loadErr.code));
  }
  if (!existing) {
    return apiError("Ordem de produção não encontrada", 404);
  }

  const { data: updated, error: updErr } = await admin
    .from("production_orders")
    .update({ pcp_deadline: pcpDeadline })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, order_number, pcp_deadline, source_kind")
    .maybeSingle();

  if (updErr) {
    return apiError(updErr.message, supabaseErrorToHttp(updErr.code));
  }
  if (!updated) {
    return apiError("Ordem de produção não encontrada", 404);
  }

  await admin
    .from("order_items")
    .update({ pcp_deadline: pcpDeadline })
    .eq("order_id", id)
    .eq("tenant_id", tenantId);

  return apiOk({ production_order: updated });
}
