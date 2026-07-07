import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { closeSalesOrderBilling } from "@/modules/faturamento/lib/sales-order-billing-closure";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem fechar sem nota.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  try {
    const result = await closeSalesOrderBilling(
      admin,
      tenantId,
      orderId,
      "without_invoice"
    );
    if (!result.ok) {
      return apiError(result.reasons.join(" "), 400);
    }

    const { data: row } = await admin
      .from("sales_orders")
      .select("*")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    return apiOk({ data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao fechar pedido.";
    return apiError(msg, 400);
  }
}
