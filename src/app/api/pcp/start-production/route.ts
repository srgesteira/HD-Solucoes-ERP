import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanProductionApontamento } from "@/modules/producao/lib/production-api-auth";
import { resolveLineApontamentoStatus } from "@/modules/producao/lib/line-apontamento";
import { commitMrpSuggestionsForOrderItem } from "@/modules/pcp/lib/mrp-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanProductionApontamento())) {
    return apiError("Sem permissão para apontamento de produção", 403);
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
  const orderItemId =
    typeof b.order_item_id === "string" ? b.order_item_id : null;
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("order_items")
    .select(
      "id, apontamento_start_at, apontamento_end_at, completed_at, status, is_suggestion"
    )
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return apiError("Item de produção não encontrado", 404);

  if (existing.is_suggestion) {
    await commitMrpSuggestionsForOrderItem(admin, tenantId, orderItemId);
  }

  const apontStatus = resolveLineApontamentoStatus(existing);
  if (apontStatus === "finished") {
    return apiError("Este item já foi finalizado.", 400);
  }
  if (apontStatus === "in_progress") {
    return apiError("Produção já iniciada para este item.", 400);
  }

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("order_items")
    .update({
      apontamento_start_at: now,
      status: "in_progress",
    })
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .select("id, apontamento_start_at, status")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item de produção não encontrado", 404);

  return apiOk({
    order_item_id: data.id,
    apontamento_start_at: data.apontamento_start_at,
    status: data.status,
  });
}
