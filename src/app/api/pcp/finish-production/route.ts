import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanProductionApontamento } from "@/modules/producao/lib/production-api-auth";
import { assertCanFinishProduction } from "@/modules/producao/lib/line-apontamento";
import { resolveLineApontamentoStatus } from "@/modules/producao/lib/line-apontamento";

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

  const qualityControl =
    typeof b.quality_control === "string"
      ? b.quality_control.trim() || null
      : null;
  const notes =
    typeof b.notes === "string"
      ? b.notes.trim() || null
      : typeof b.production_notes === "string"
        ? b.production_notes.trim() || null
        : null;

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
    return apiError("Não é possível apontar numa sugestão do MRP.", 400);
  }

  const apontStatus = resolveLineApontamentoStatus(existing);
  if (apontStatus === "finished") {
    return apiError("Este item já foi finalizado.", 400);
  }
  if (apontStatus === "not_started") {
    return apiError("Inicie a produção antes de finalizar.", 400);
  }

  const gate = await assertCanFinishProduction(admin, tenantId, orderItemId);
  if (!gate.allowed) {
    return apiError(gate.reason, 403, { code: gate.code });
  }

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("order_items")
    .update({
      apontamento_end_at: now,
      completed_at: now,
      quality_control: qualityControl,
      production_notes: notes,
      status: "completed",
    })
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .select(
      "id, apontamento_start_at, apontamento_end_at, quality_control, production_notes, completed_at"
    )
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item de produção não encontrado", 404);

  return apiOk(data);
}
