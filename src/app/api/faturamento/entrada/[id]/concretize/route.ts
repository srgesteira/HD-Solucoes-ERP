import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  ensurePayablesForPurchaseOrder,
  purchaseOrderRowToPayablesInput,
} from "@/modules/compras/lib/purchasing/purchase-payables";
import { finalizePurchaseOrderReceive } from "@/modules/compras/lib/purchasing/purchase-order-receive-finalize";
import { isFiscalConfigured } from "@/modules/fiscal/lib/fiscal-rules-types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Concretiza PC no kanban de entrada: reusa finalizePurchaseOrderReceive
 * (estoque + AP). Exige fiscal já conferido.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const { data: existing, error } = await admin
      .from("purchase_orders")
      .select(
        "id, status, fiscal_status, po_number, order_date, supplier_id, is_suggestion, subtotal, discount, tax, total_icms, total_ipi, total_tax_base, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments"
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("is_suggestion", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) return apiError("Pedido de compra não encontrado", 404);
    if (existing.status === "received") {
      return apiError("Pedido já concretizado (recebido).", 400);
    }
    if (existing.status === "cancelled") {
      return apiError("Pedido cancelado não pode ser concretizado.", 400);
    }
    if (existing.status !== "confirmed" && existing.status !== "partial") {
      return apiError(
        'Pedido deve estar "Confirmado" ou "Parcial" para concretizar.',
        400
      );
    }
    if (!isFiscalConfigured(existing.fiscal_status ?? "pending")) {
      return apiError(
        "Conferência fiscal pendente — aplique regras antes de concretizar.",
        400
      );
    }

    const payablesOrder = purchaseOrderRowToPayablesInput(existing);
    await ensurePayablesForPurchaseOrder(admin, tenantId, payablesOrder, {
      previousStatus: existing.status,
      currentStatus: "received",
    });

    const result = await finalizePurchaseOrderReceive(admin, tenantId, id);
    return apiOk({
      order_id: result.order?.id ?? id,
      status: result.order?.status ?? "received",
      receive: result.receive,
    });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao concretizar recebimento",
      500
    );
  }
}
