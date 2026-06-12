import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { finalizePurchaseOrderReceive } from "@/modules/compras/lib/purchasing/purchase-order-receive-finalize";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Recalcula custos (rateio de extras) e marca o pedido como recebido. */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("purchase_orders")
    .select("id, status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .maybeSingle();

  if (fetchErr) {
    return apiError(
      "Erro ao validar pedido: " + fetchErr.message,
      supabaseErrorToHttp(fetchErr.code)
    );
  }
  if (!existing) return apiError("Pedido não encontrado", 404);

  if (existing.status === "received") {
    return apiError("Pedido já foi recebido.", 409);
  }
  if (existing.status === "cancelled") {
    return apiError("Pedido cancelado não pode ser recebido.", 400);
  }

  try {
    const { order, receive } = await finalizePurchaseOrderReceive(
      admin,
      tenantId,
      id
    );
    return apiOk({ data: order, receive });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao processar recebimento.",
      500
    );
  }
}
