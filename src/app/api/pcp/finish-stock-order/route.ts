import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import { isOrderItemProductionFinished } from "@/modules/pcp/lib/order-item-production-status";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
  const productionOrderId =
    typeof b.production_order_id === "string" ? b.production_order_id : null;
  if (!productionOrderId) {
    return apiError("production_order_id é obrigatório", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: op, error: opErr } = await admin
    .from("production_orders")
    .select("id, order_number, status, source_kind, is_suggestion")
    .eq("id", productionOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (opErr) return apiError(opErr.message, 400);
  if (!op) return apiError("Ordem de produção não encontrada", 404);
  if (op.is_suggestion) {
    return apiError("Não é possível finalizar uma sugestão do MRP.", 400);
  }
  if (op.source_kind !== "stock") {
    return apiError("Esta ordem não é de estoque.", 409);
  }
  if (op.status === "finished") {
    return apiError("Ordem já finalizada.", 409);
  }
  if (op.status === "cancelled") {
    return apiError("Ordem cancelada não pode ser finalizada.", 409);
  }

  const { data: items, error: itemsErr } = await admin
    .from("order_items")
    .select(
      "id, production_start, production_end, status, completed_at, apontamento_start_at, apontamento_end_at"
    )
    .eq("order_id", productionOrderId)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false);

  if (itemsErr) return apiError(itemsErr.message, 400);
  if (!items?.length) {
    return apiError("Ordem sem itens de produção.", 409);
  }

  const allReady = items.every((it) =>
    isOrderItemProductionFinished({
      production_start: it.production_start,
      production_end: it.production_end,
      status: it.status,
      completed_at: it.completed_at,
      apontamento_start_at: it.apontamento_start_at,
      apontamento_end_at: it.apontamento_end_at,
    })
  );

  if (!allReady) {
    return apiError(
      "Produção ainda não concluída. Finalize todos os itens na linha antes de fechar no PCP.",
      409
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("production_orders")
    .update({ status: "finished", finished_at: now })
    .eq("id", productionOrderId)
    .eq("tenant_id", tenantId)
    .select("id, order_number, status, finished_at, source_kind")
    .maybeSingle();

  if (updErr) return apiError(updErr.message, 400);
  if (!updated) return apiError("Ordem de produção não encontrada", 404);

  return apiOk({ production_order: updated });
}
