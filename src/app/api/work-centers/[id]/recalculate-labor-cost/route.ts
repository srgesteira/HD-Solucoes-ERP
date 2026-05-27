import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { calculateHourlyRateWithAllocation } from "@/lib/labor-cost-utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem recalcular custo de mão de obra.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id: workCenterId } = await ctx.params;

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

  const { count } = await admin
    .from("work_centers")
    .select("*", { count: "exact", head: true })
    .eq("id", workCenterId)
    .eq("tenant_id", tenantId);

  if (!count) {
    return apiError("Centro de trabalho não encontrado", 404);
  }

  try {
    const lines = await calculateHourlyRateWithAllocation(
      admin,
      tenantId,
      year,
      month
    );
    const line = lines.find((l) => l.work_center_id === workCenterId);

    if (!line || line.total_hours <= 0) {
      return apiOk({
        saved: false,
        message:
          "Não há colaboradores/horas nesta linha para calcular o custo/hora.",
        year,
        month,
      });
    }

    return apiOk({
      saved: true,
      year,
      month,
      hourly_rate: line.hourly_rate,
      direct_hourly_rate: line.direct_hourly_rate,
      allocated_hourly_rate: line.allocated_hourly_rate,
      total_salary_base: line.direct_cost + line.allocated_cost,
      total_hours_base: line.total_hours,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao calcular";
    return apiError(msg, 500);
  }
}
