import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { countPurchaseRequisitions } from "@/modules/compras/lib/purchasing-requisitions";

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
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

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
