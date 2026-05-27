import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertModuleAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await assertModuleAccess("finance");
  if (!gate.ok) {
    const prod = await assertModuleAccess("production");
    if (!prod.ok) return gate.response;
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const endYear = Number(sp.get("year") ?? new Date().getFullYear());
  const lineId = sp.get("lineId")?.trim() || null;
  const monthsBack = Math.min(24, Math.max(1, Number(sp.get("months") ?? 12)));

  if (!Number.isFinite(endYear)) {
    return apiError("Ano inválido", 400);
  }

  const admin = createSupabaseAdminClient();

  const periods: Array<{ year: number; month: number; label: string }> = [];
  let y = endYear;
  let m = Number(sp.get("month") ?? new Date().getMonth() + 1);
  if (!Number.isFinite(m) || m < 1 || m > 12) {
    m = new Date().getMonth() + 1;
  }

  for (let i = 0; i < monthsBack; i++) {
    periods.unshift({
      year: y,
      month: m,
      label: `${String(m).padStart(2, "0")}/${y}`,
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }

  const minPeriod = periods[0];

  let q = admin
    .from("labor_costs")
    .select(
      "work_center_id, year, month, hourly_rate, direct_hourly_rate, allocated_hourly_rate, direct_cost, allocated_cost"
    )
    .eq("tenant_id", tenantId)
    .gte("year", minPeriod.year);

  if (lineId) q = q.eq("work_center_id", lineId);

  const { data: lcRows, error: lcErr } = await q;
  if (lcErr) {
    return apiError(lcErr.message, supabaseErrorToHttp(lcErr.code));
  }

  const { data: wcRows } = await admin
    .from("work_centers")
    .select("id, code, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const wcMeta = new Map(
    (wcRows ?? []).map((w) => [w.id, { code: w.code, name: w.name }])
  );

  const byLineMonth = new Map<string, number | null>();
  for (const row of lcRows ?? []) {
    const key = `${row.work_center_id}:${row.year}:${row.month}`;
    byLineMonth.set(key, row.hourly_rate != null ? Number(row.hourly_rate) : null);
  }

  const lineIds = lineId
    ? [lineId]
    : (wcRows ?? []).map((w) => w.id);

  const series = lineIds.map((wcId) => {
    const meta = wcMeta.get(wcId);
    const points = periods.map((p) => {
      const rate = byLineMonth.get(`${wcId}:${p.year}:${p.month}`) ?? null;
      return {
        year: p.year,
        month: p.month,
        label: p.label,
        hourly_rate: rate,
      };
    });
    return {
      work_center_id: wcId,
      code: meta?.code ?? "",
      name: meta?.name ?? "",
      points,
    };
  });

  return apiOk({
    end_year: endYear,
    months: monthsBack,
    periods: periods.map((p) => p.label),
    series,
  });
}
