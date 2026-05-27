import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { defaultExpectedDeliveryForOrder } from "@/modules/vendas/lib/sales/sales-flow";

export const dynamic = "force-dynamic";

/**
 * Preenche `expected_delivery` em pedidos do tenant (order_date + 30 dias).
 * POST — apenas administrador. Idempotente.
 */
export async function POST(_request: NextRequest) {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem executar o backfill", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: rows, error: selErr } = await admin
    .from("sales_orders")
    .select("id, order_date")
    .eq("tenant_id", tenantId)
    .is("expected_delivery", null);

  if (selErr) return apiError(selErr.message, 400);

  let updated = 0;
  for (const row of rows ?? []) {
    const expected = defaultExpectedDeliveryForOrder(
      String(row.order_date ?? "")
    );
    const { error: uErr } = await admin
      .from("sales_orders")
      .update({ expected_delivery: expected })
      .eq("id", row.id)
      .eq("tenant_id", tenantId);
    if (!uErr) updated += 1;
  }

  return apiOk({
    updated,
    pending_before: rows?.length ?? 0,
  });
}
