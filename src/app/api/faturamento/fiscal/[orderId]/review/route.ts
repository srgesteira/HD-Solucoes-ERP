import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  getFiscalOrderReview,
  markSalesOrderFiscalAligned,
  parseManualItemInput,
  reapplyFiscalRulesToSalesOrder,
  saveManualFiscalItemOverride,
} from "@/modules/faturamento/lib/fiscal-order-review-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  try {
    const data = await getFiscalOrderReview(admin, tenantId, orderId);
    if (!data) return apiError("Pedido não encontrado", 404);
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar revisão fiscal.",
      400
    );
  }
}

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
    return apiError("Apenas administradores podem alterar o fiscal.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "align";
  const admin = createSupabaseAdminClient();

  try {
    if (action === "reapply") {
      await reapplyFiscalRulesToSalesOrder(
        admin,
        tenantId,
        orderId,
        user.id
      );
      const data = await getFiscalOrderReview(admin, tenantId, orderId);
      return apiOk({ data });
    }

    if (action === "manual_item") {
      const itemId =
        typeof body.item_id === "string" ? body.item_id.trim() : "";
      if (!itemId) return apiError("item_id obrigatório.", 400);

      const parsed = parseManualItemInput(body.fiscal);
      if (!parsed) {
        return apiError("CFOP inválido — use 4 dígitos numéricos.", 400);
      }

      const result = await saveManualFiscalItemOverride(
        admin,
        tenantId,
        orderId,
        itemId,
        parsed,
        user.id
      );
      if (!result.ok) {
        return apiError(result.reasons.join(" "), 400);
      }
      const data = await getFiscalOrderReview(admin, tenantId, orderId);
      return apiOk({ data });
    }

    if (action === "align") {
      const result = await markSalesOrderFiscalAligned(admin, tenantId, orderId);
      if (!result.ok) {
        return apiError(result.reasons.join(" "), 400);
      }
      const data = await getFiscalOrderReview(admin, tenantId, orderId);
      return apiOk({ data });
    }

    return apiError("Acção inválida.", 400);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao processar revisão fiscal.",
      400
    );
  }
}
