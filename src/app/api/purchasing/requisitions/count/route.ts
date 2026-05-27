import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { countPurchaseRequisitions } from "@/lib/purchasing-requisitions";

export const dynamic = "force-dynamic";

/**
 * Contador de requisições pendentes (draft, sem purchase_order_id).
 * Não usa suggested_supplier_id nem need_date — deve funcionar antes da migration.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const count = await countPurchaseRequisitions(admin, tenantId);
    return apiOk({ count, pending: count });
  } catch (e) {
    console.error("[requisitions/count]", e);
    return apiOk({ count: 0, pending: 0 });
  }
}
