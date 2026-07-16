import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  getFiscalPurchaseOrderReview,
  reapplyFiscalToPurchaseOrder,
} from "@/modules/faturamento/lib/fiscal-purchase-order-review-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
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
    const review = await getFiscalPurchaseOrderReview(admin, tenantId, id);
    if (!review) return apiError("Pedido de compra não encontrado", 404);
    return apiOk({ data: review });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar revisão fiscal",
      500
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };
  const action = body.action?.trim() ?? "reapply";

  try {
    const admin = createSupabaseAdminClient();
    if (action === "reapply" || action === "apply") {
      const review = await reapplyFiscalToPurchaseOrder(
        admin,
        tenantId,
        id,
        user.id
      );
      return apiOk({ data: review });
    }
    return apiError("Acção inválida", 400);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro na revisão fiscal de entrada",
      400
    );
  }
}
