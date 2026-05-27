import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import { fetchPcpPurchaseSchedule } from "@/modules/pcp/lib/pcp-purchase-schedule";

export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const admin = createSupabaseAdminClient();
    const rows = await fetchPcpPurchaseSchedule(admin, tenantId);
    return apiOk({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar cronograma";
    return apiError(msg, 500);
  }
}

export async function PATCH(request: NextRequest) {
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
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return apiError("id é obrigatório", 400);

  const followUp =
    b.follow_up_date === null || b.follow_up_date === ""
      ? null
      : String(b.follow_up_date).slice(0, 10);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("purchase_order_items")
    .update({ follow_up_date: followUp })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, follow_up_date")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item não encontrado", 404);

  return apiOk({ data });
}
