import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { applyFiscalToPurchaseOrderItems } from "@/modules/fiscal/lib/fiscal-rules-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Reaplica regras fiscais a todos os itens do PC (módulo Faturamento). */
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
    const { data: po, error } = await admin
      .from("purchase_orders")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!po) return apiError("Pedido de compra não encontrado", 404);
    if (po.status === "received") {
      return apiError("Pedido já recebido — fiscal não pode ser reaplicado.", 400);
    }
    if (po.status === "cancelled") {
      return apiError("Pedido cancelado.", 400);
    }
    if (
      po.status !== "sent" &&
      po.status !== "confirmed" &&
      po.status !== "partial"
    ) {
      return apiError(
        'Pedido deve estar "Enviado", "Confirmado" ou "Parcial".',
        400
      );
    }

    const result = await applyFiscalToPurchaseOrderItems(
      admin,
      tenantId,
      id,
      user.id
    );
    if (result.itemsProcessed === 0) {
      return apiError(
        "Nenhuma linha com produto processada — associe produtos aos itens.",
        400
      );
    }
    return apiOk(result);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao aplicar fiscal",
      500
    );
  }
}
