import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("pcp");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const salesOrderItemId =
    typeof b.sales_order_item_id === "string" ? b.sales_order_item_id : null;
  const purchaseOrderItemId =
    typeof b.purchase_order_item_id === "string"
      ? b.purchase_order_item_id
      : null;

  if (!salesOrderItemId || !purchaseOrderItemId) {
    return apiError("sales_order_item_id e purchase_order_item_id são obrigatórios", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: soi } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("id", salesOrderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!soi) return apiError("Linha de venda não encontrada", 404);

  const { data: poi, error } = await admin
    .from("purchase_order_items")
    .update({ sales_order_item_id: salesOrderItemId })
    .eq("id", purchaseOrderItemId)
    .eq("tenant_id", tenantId)
    .select("id, purchase_order_id")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!poi) return apiError("Item de compra não encontrado", 404);

  return apiOk({ purchase_order_item_id: poi.id, purchase_order_id: poi.purchase_order_id });
}
