import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import { computeCashFlowProjection } from "@/modules/finance/lib/cash-flow-projection";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/cash-flow?horizon=90
 * Projeção: entradas (receivables) vs saídas (AP + PCs confirmados sem AP).
 * Provisórios: data = expected_delivery + prazo de pagamento por parcela.
 * Cálculo em computeCashFlowProjection() (reaproveitado pelo alerta financeiro).
 */
export async function GET(request: NextRequest) {
  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const horizon = Math.min(
    120,
    Math.max(30, parseInt(request.nextUrl.searchParams.get("horizon") ?? "90", 10) || 90)
  );

  const admin = createSupabaseAdminClient();

  try {
    const projection = await computeCashFlowProjection(admin, tenantId, horizon);
    return apiOk(projection);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao calcular fluxo de caixa",
      500
    );
  }
}
