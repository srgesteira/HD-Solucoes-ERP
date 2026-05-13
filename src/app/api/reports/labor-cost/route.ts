import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertProductionOrReportsAccess } from "@/lib/utils/module-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/labor-cost?year=2026&month=5
 */
export async function GET(request: NextRequest) {
  const gate = await assertProductionOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const now = new Date();
  const yRaw = sp.get("year");
  const mRaw = sp.get("month");
  const year = yRaw ? parseInt(yRaw, 10) : now.getFullYear();
  const month = mRaw ? parseInt(mRaw, 10) : now.getMonth() + 1;

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return apiError("Parâmetro year inválido", 400);
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return apiError("Parâmetro month inválido", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: centers, error: wcErr } = await admin
    .from("work_centers")
    .select("id, code, name, is_active, default_monthly_hours")
    .eq("tenant_id", tenantId)
    .order("code", { ascending: true });

  if (wcErr) {
    return apiError("Centros: " + wcErr.message, 500);
  }

  const ids = (centers ?? []).map((c) => c.id);
  const costsMap: Record<
    string,
    {
      hourly_rate: number;
      total_salary_base: number;
      total_hours_base: number;
      calculated_at: string | null;
    }
  > = {};

  if (ids.length) {
    const { data: costs, error: lcErr } = await admin
      .from("labor_costs")
      .select(
        "work_center_id, hourly_rate, total_salary_base, total_hours_base, calculated_at"
      )
      .eq("tenant_id", tenantId)
      .eq("year", year)
      .eq("month", month)
      .in("work_center_id", ids);

    if (lcErr) {
      return apiError("Custos: " + lcErr.message, 500);
    }

    for (const row of costs ?? []) {
      costsMap[row.work_center_id] = {
        hourly_rate: Number(row.hourly_rate),
        total_salary_base: Number(row.total_salary_base),
        total_hours_base: row.total_hours_base,
        calculated_at: row.calculated_at,
      };
    }
  }

  const rows = (centers ?? []).map((c) => {
    const lc = costsMap[c.id];
    return {
      work_center_id: c.id,
      code: c.code,
      name: c.name,
      is_active: c.is_active,
      default_monthly_hours: c.default_monthly_hours,
      hourly_rate: lc?.hourly_rate ?? null,
      total_salary_base: lc?.total_salary_base ?? null,
      total_hours_base: lc?.total_hours_base ?? null,
      calculated_at: lc?.calculated_at ?? null,
    };
  });

  return apiOk({ year, month, rows });
}
