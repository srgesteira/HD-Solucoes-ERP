/**
 * TEMPORÁRIO (passo 2 MRP-estoque): teste isolado do motor de OP de estoque.
 * Remover após integrar runMrpForStockProductionOrders em mrp-suggestions (passo 3).
 *
 * POST { confirm?: boolean, production_order_id?: string, order_number?: string }
 * - Com production_order_id ou order_number → uma OP
 * - Sem id → lote (runMrpForStockProductionOrders)
 */
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import {
  processMrpForStockProductionOrder,
  runMrpForStockProductionOrders,
} from "@/modules/pcp/lib/mrp-service";

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
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem executar o MRP.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const confirm = b.confirm === true;
  const productionOrderId =
    typeof b.production_order_id === "string" ? b.production_order_id.trim() : "";
  const orderNumber =
    typeof b.order_number === "string" ? b.order_number.trim() : "";

  const admin = createSupabaseAdminClient();

  try {
    if (productionOrderId || orderNumber) {
      let opId = productionOrderId;
      if (!opId && orderNumber) {
        const { data: op } = await admin
          .from("production_orders")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("order_number", orderNumber)
          .eq("source_kind", "stock")
          .maybeSingle();
        if (!op?.id) {
          return apiError("Ordem de produção de estoque não encontrada.", 404);
        }
        opId = op.id;
      }

      const result = await processMrpForStockProductionOrder(
        admin,
        tenantId,
        user.id,
        opId,
        confirm
      );
      return apiOk({ mode: "single", confirm, result });
    }

    const batch = await runMrpForStockProductionOrders(
      admin,
      tenantId,
      user.id,
      confirm
    );
    return apiOk({ mode: "batch", confirm, ...batch });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no MRP de estoque.", 400);
  }
}
