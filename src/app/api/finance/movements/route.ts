import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { listFinancialMovements } from "@/modules/finance/lib/financial-movements-list";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/finance/movements — extrato unificado (financial_movements + cash_flow_entries) */
export async function GET(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50)
  );

  const directionRaw = sp.get("direction")?.trim() ?? "all";
  let direction: "in" | "out" | "all" = "all";
  if (directionRaw !== "all") {
    if (directionRaw !== "in" && directionRaw !== "out") {
      return apiError("direction inválido (use in, out ou all)", 400);
    }
    direction = directionRaw;
  }

  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();
  if (from && !ISO_DATE.test(from)) {
    return apiError("from inválido (use YYYY-MM-DD)", 400);
  }
  if (to && !ISO_DATE.test(to)) {
    return apiError("to inválido (use YYYY-MM-DD)", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    const result = await listFinancialMovements(admin, tenantId, {
      page,
      limit,
      direction,
      from: from || undefined,
      to: to || undefined,
    });
    return apiOk(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao listar movimentações.";
    return apiError(message, supabaseErrorToHttp(null));
  }
}
