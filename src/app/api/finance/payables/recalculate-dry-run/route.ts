import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { listPayablesRecalcDryRun } from "@/modules/compras/lib/purchasing/purchase-payables";

export const dynamic = "force-dynamic";

/** Dry run do recálculo de parcelas geradas por PC (não altera dados). */
export async function GET() {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem consultar o recálculo.", 403);
  }

  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const result = await listPayablesRecalcDryRun(admin, tenantId);

  return apiOk({
    dry_run: true,
    summary: {
      would_update_count: result.would_update.length,
      skipped_count: result.skipped.length,
    },
    ...result,
  });
}
