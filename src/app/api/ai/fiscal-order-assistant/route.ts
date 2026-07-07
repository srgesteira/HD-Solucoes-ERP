import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { assistFiscalSalesOrder } from "@/modules/fiscal/lib/fiscal-order-ai.service";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem usar o assistente fiscal.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const b =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const salesOrderId =
    typeof b.sales_order_id === "string" ? b.sales_order_id.trim() : "";
  const description =
    typeof b.description === "string" ? b.description.trim() : "";

  if (!salesOrderId || !UUID_RE.test(salesOrderId)) {
    return apiError("sales_order_id inválido.", 400);
  }

  try {
    const result = await assistFiscalSalesOrder(
      tenantId,
      salesOrderId,
      description,
      user.id
    );
    return apiOk({ data: result });
  } catch (e) {
    console.error("[ai/fiscal-order-assistant]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro no assistente fiscal.",
      400
    );
  }
}
