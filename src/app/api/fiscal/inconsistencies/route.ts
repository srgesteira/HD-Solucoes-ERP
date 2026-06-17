import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { scanFiscalInconsistencies } from "@/modules/fiscal/lib/fiscal-inconsistency-scan";
import { explainFiscalInconsistencies } from "@/modules/engenharia/lib/services/ai.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const explain = request.nextUrl.searchParams.get("explain") === "1";

  try {
    const admin = createSupabaseAdminClient();
    const issues = await scanFiscalInconsistencies(admin, tenantId);

    if (!explain) {
      return apiOk({
        issues,
        total: issues.length,
        blockers: issues.filter((i) => i.severity === "blocker").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
      });
    }

    const explanation = await explainFiscalInconsistencies(
      issues.map((i) => ({
        check_id: i.check_id,
        severity: i.severity,
        title: i.title,
        impact: i.impact,
        count: i.count,
        detail: i.detail,
      }))
    );

    return apiOk({ issues, explanation });
  } catch (e) {
    console.error("[fiscal/inconsistencies]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao analisar inconsistências",
      supabaseErrorToHttp(null)
    );
  }
}
