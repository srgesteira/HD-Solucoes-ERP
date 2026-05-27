import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { fetchPcpPlanning } from "@/modules/pcp/lib/pcp-planning";
import { syncSalesOrderReadyForInvoice } from "@/modules/vendas/lib/sales/sales-order-ready-for-invoice";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  try {
    const orders = await fetchPcpPlanning(admin, tenantId);
    for (const order of orders) {
      try {
        order.ready_for_invoice = await syncSalesOrderReadyForInvoice(
          admin,
          tenantId,
          order.id
        );
      } catch {
        /* mantém valor da BD */
      }
    }
    return apiOk({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar planeamento PCP.";
    return apiError(msg, 400);
  }
}
