import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { createAndLinkBlingProductForSalesOrder } from "@/modules/fiscal/lib/bling/bling-catalog";
import { BlingApiError } from "@/modules/fiscal/lib/bling/bling-errors";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }

  const productId =
    typeof body.product_id === "string" ? body.product_id.trim() : "";
  if (!productId) return apiError("product_id obrigatório.", 400);

  const admin = createSupabaseAdminClient();
  try {
    const data = await createAndLinkBlingProductForSalesOrder(
      admin,
      tenantId,
      orderId,
      productId
    );
    return apiOk({ data });
  } catch (e) {
    const message =
      e instanceof BlingApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Erro ao criar produto no Bling.";
    return apiError(message, e instanceof BlingApiError ? e.status || 400 : 400);
  }
}
