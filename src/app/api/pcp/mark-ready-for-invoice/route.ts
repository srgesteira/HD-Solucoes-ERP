import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import { markSalesOrderReadyForInvoice } from "@/modules/vendas/lib/sales/sales-order-ready-for-invoice";
import { enrichSalesOrdersListWithProduction } from "@/modules/vendas/lib/sales/sales-order-production-summary";
import { computeOrderProductionAggregateStatus } from "@/modules/pcp/lib/order-item-production-status";

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
  const salesOrderId =
    typeof b.sales_order_id === "string" ? b.sales_order_id : null;
  if (!salesOrderId) return apiError("sales_order_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("sales_orders")
    .select("id, status")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!order) return apiError("Pedido de venda não encontrado", 404);
  if (order.status === "cancelled" || order.status === "superseded") {
    return apiError("Pedido não pode ser liberado para faturamento", 409);
  }

  try {
    const prodMap = await enrichSalesOrdersListWithProduction(
      admin,
      tenantId,
      [salesOrderId]
    );
    const items = prodMap.get(salesOrderId);
    const aggregate = items
      ? items.production_status
      : computeOrderProductionAggregateStatus([]);
    if (aggregate !== "finished") {
      return apiError(
        "Produção ainda não concluída. Conclua todos os itens antes de finalizar no PCP.",
        409
      );
    }
    await markSalesOrderReadyForInvoice(admin, tenantId, salesOrderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao actualizar pedido";
    return apiError(msg, 500);
  }

  const { data: updated } = await admin
    .from("sales_orders")
    .select("id, order_number, ready_for_invoice, status")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return apiOk({ data: updated });
}
