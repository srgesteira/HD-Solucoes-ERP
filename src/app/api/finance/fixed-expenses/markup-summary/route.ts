import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import { getFixedCostCenterSummary } from "@/modules/finance/lib/fixed-expenses-markup";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/fixed-expenses/markup-summary?competencia=2026-07
 * Dados prontos para o cálculo de markup (centro Fixo).
 */
export async function GET(request: NextRequest) {
  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const competencia =
    request.nextUrl.searchParams.get("competencia")?.trim() ??
    new Date().toISOString().slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return apiError("competencia inválida (use YYYY-MM)", 400);
  }

  const admin = createSupabaseAdminClient();
  try {
    const summary = await getFixedCostCenterSummary(admin, tenantId, competencia);
    return apiOk({ data: summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao calcular centro Fixo";
    return apiError(msg, 500);
  }
}
