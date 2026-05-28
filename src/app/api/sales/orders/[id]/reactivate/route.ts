import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { insertSalesOrderLogsBestEffort } from "@/modules/vendas/lib/sales/sales-order-change-log";
import {
  salesOrderHasLinkedPurchaseOrderItems,
  salesOrderHasProductionStart,
} from "@/modules/vendas/lib/sales/reactivate-sales-order";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const REACTIVATE_STATUS = "pending";

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: order, error: fetchErr } = await admin
    .from("sales_orders")
    .select("id, status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) {
    return apiError(
      "Erro ao buscar pedido: " + fetchErr.message,
      supabaseErrorToHttp(fetchErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  if (order.status !== "cancelled") {
    return apiError(
      "Apenas pedidos cancelados podem ser reativados.",
      400
    );
  }

  try {
    const hasProduction = await salesOrderHasProductionStart(
      admin,
      tenantId,
      id
    );
    if (hasProduction) {
      return apiError(
        "Pedido já teve produção iniciada e não pode ser reativado.",
        400
      );
    }

    const hasPc = await salesOrderHasLinkedPurchaseOrderItems(
      admin,
      tenantId,
      id
    );
    if (hasPc) {
      return apiError(
        "Existem pedidos de compra vinculados. Cancele-os antes de reativar.",
        400
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na validação";
    return apiError(msg, 500);
  }

  const { data: updated, error: updErr } = await admin
    .from("sales_orders")
    .update({ status: REACTIVATE_STATUS })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, status, order_number")
    .maybeSingle();

  if (updErr) {
    return apiError(
      "Erro ao reativar pedido: " + updErr.message,
      supabaseErrorToHttp(updErr.code)
    );
  }
  if (!updated) return apiError("Pedido não encontrado", 404);

  await insertSalesOrderLogsBestEffort(admin, tenantId, id, user.id, [
    {
      field_name: "status",
      old_value: "cancelled",
      new_value: REACTIVATE_STATUS,
      notes: "Pedido reativado",
    },
  ]);

  return apiOk({ data: updated });
}
