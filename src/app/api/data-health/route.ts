import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { loadDataHealthIssues } from "@/modules/core/lib/data-health/data-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const issues = await loadDataHealthIssues(admin, tenantId);

  return apiOk({
    issues,
    total: issues.length,
    blockers: issues.filter((i) => i.severity === "blocker").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  });
}
