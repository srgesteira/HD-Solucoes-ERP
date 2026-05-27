import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { currentUserCanPcpPlanning } from "@/lib/pcp-api-auth";
import {
  markSalesOrderReadyForInvoice,
  syncSalesOrderReadyForInvoice,
} from "@/lib/sales/sales-order-ready-for-invoice";
import { enrichSalesOrdersListWithProduction } from "@/lib/sales/sales-order-production-summary";
import { computeOrderProductionAggregateStatus } from "@/lib/order-item-production-status";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
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

  const manual = b.manual === true;
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
    if (manual) {
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
          "Produção ainda não concluída. Conclua todos os itens antes de liberar para faturamento.",
          409
        );
      }
      await markSalesOrderReadyForInvoice(admin, tenantId, salesOrderId);
    } else {
      await syncSalesOrderReadyForInvoice(admin, tenantId, salesOrderId);
    }
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
