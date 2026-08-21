import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { reopenFiscalConferenceQueue } from "@/modules/faturamento/lib/fiscal-order-review-service";

export const dynamic = "force-dynamic";

export async function POST() {
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  try {
    const result = await reopenFiscalConferenceQueue(admin, tenantId);
    return apiOk({ data: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao reabrir conferência";
    return apiError(message, 500);
  }
}
