import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import { finishProductionOrderItem } from "@/modules/producao/lib/finish-production-item";

export const dynamic = "force-dynamic";

/** Legado PCP — delega ao handler unificado de finalização. */
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
  const orderItemId =
    typeof b.order_item_id === "string" ? b.order_item_id : null;
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();

  try {
    const result = await finishProductionOrderItem(admin, tenantId, {
      orderItemId,
      userId: user.id,
      legacyProductionDates: true,
    });
    return apiOk({
      id: result.order_item.id,
      production_start: result.order_item.production_start,
      production_end: result.order_item.production_end,
      status: result.order_item.status,
      supply: result.supply,
      inventory: result.inventory,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.message.includes("já foi finalizado") ? 400 : err.code ? 403 : 500;
    return apiError(err.message, status, err.code ? { code: err.code } : undefined);
  }
}
