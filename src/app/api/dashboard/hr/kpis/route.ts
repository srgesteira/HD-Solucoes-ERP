import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";
import {
  parseDashboardPeriod,
  round1,
  round2,
} from "@/lib/dashboard/period";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await assertModuleAccess("hr");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { from, to } = parseDashboardPeriod(request.nextUrl.searchParams);
  const admin = createSupabaseAdminClient();

  const { data: allEmployees } = await admin
    .from("employees")
    .select("id, status, monthly_salary, updated_at")
    .eq("tenant_id", tenantId);

  const list = allEmployees ?? [];
  const activeEnd = list.filter((e) => e.status === "active").length;

  const activeAtStart = list.filter((e) => {
    if (e.status === "active") return true;
    if (e.status === "terminated") {
      const termDate = e.updated_at.slice(0, 10);
      return termDate > from;
    }
    return false;
  }).length;

  const terminatedInMonth = list.filter((e) => {
    if (e.status !== "terminated") return false;
    const d = e.updated_at.slice(0, 10);
    return d >= from && d <= to;
  }).length;

  const avgActive = (activeAtStart + activeEnd) / 2;
  const turnoverPct =
    avgActive > 0 ? round1((terminatedInMonth / avgActive) * 100) : null;

  const payrollTotal = list
    .filter((e) => e.status === "active")
    .reduce((s, e) => s + Number(e.monthly_salary ?? 0), 0);

  const avgCostPerEmployee =
    activeEnd > 0 ? round2(payrollTotal / activeEnd) : 0;

  return apiOk({
    data: {
      period_from: from,
      period_to: to,
      active_employees: activeEnd,
      payroll_total_month: round2(payrollTotal),
      turnover_pct: turnoverPct,
      terminated_in_period: terminatedInMonth,
      avg_cost_per_employee: avgCostPerEmployee,
      overtime_hours: 0,
      overtime_note:
        "Horas extras: integração futura com apontamento de produção.",
    },
  });
}
