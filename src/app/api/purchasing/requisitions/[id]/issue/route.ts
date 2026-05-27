import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { issueRequisitionsAsPurchaseOrder } from "@/lib/purchasing/requisition-issue";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id: itemId } = await context.params;
  if (!itemId) return apiError("id é obrigatório", 400);

  try {
    const admin = createSupabaseAdminClient();
    const result = await issueRequisitionsAsPurchaseOrder(
      admin,
      tenantId,
      user.id,
      [itemId]
    );
    return apiOk({
      purchase_order_id: result.purchase_order_id,
      po_number: result.po_number,
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao emitir PC", 400);
  }
}
