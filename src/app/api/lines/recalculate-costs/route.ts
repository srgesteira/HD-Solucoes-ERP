import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { calculateHourlyRateWithAllocation } from "@/modules/rh/lib/labor-cost-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem recalcular custos.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: { year?: number; month?: number } = {};
  try {
    const t = await request.text();
    if (t) body = JSON.parse(t) as { year?: number; month?: number };
  } catch {
    return apiError("Body JSON inválido", 400);
  }

  const now = new Date();
  const year = body.year ?? now.getFullYear();
  const month = body.month ?? now.getMonth() + 1;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return apiError("Ano inválido", 400);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return apiError("Mês inválido", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    const lines = await calculateHourlyRateWithAllocation(
      admin,
      tenantId,
      year,
      month
    );
    return apiOk({
      year,
      month,
      lines_processed: lines.length,
      lines,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao recalcular custos";
    return apiError(msg, 500);
  }
}
