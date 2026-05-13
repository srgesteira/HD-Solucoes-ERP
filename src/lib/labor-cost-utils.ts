import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type LaborCostSnapshot = {
  hourly_rate: number;
  total_salary_base: number;
  total_hours_base: number;
};

const DEFAULT_MONTHLY_HOURS = 220;

/**
 * Custo/hora da linha = soma(salários ativos na linha) / soma(horas padrão mensais por colaborador).
 * Horas padrão vêm de `work_centers.default_monthly_hours` (fallback 220).
 */
export async function calculateLaborCostForWorkCenter(
  client: SupabaseClient<Database>,
  tenantId: string,
  work_center_id: string
): Promise<LaborCostSnapshot | null> {
  const { data: wc, error: wcErr } = await client
    .from("work_centers")
    .select("default_monthly_hours")
    .eq("id", work_center_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (wcErr || !wc) return null;

  const monthlyHoursPerEmployee =
    wc.default_monthly_hours != null && wc.default_monthly_hours > 0
      ? wc.default_monthly_hours
      : DEFAULT_MONTHLY_HOURS;

  const { data: employees, error: empErr } = await client
    .from("employees")
    .select("monthly_salary")
    .eq("tenant_id", tenantId)
    .eq("work_center_id", work_center_id)
    .eq("status", "active");

  if (empErr) {
    throw new Error(empErr.message);
  }

  if (!employees?.length) return null;

  let totalSalary = 0;
  let totalHours = 0;

  for (const emp of employees) {
    totalSalary += Number(emp.monthly_salary ?? 0);
    totalHours += monthlyHoursPerEmployee;
  }

  if (totalHours <= 0) return null;

  const hourly_rate =
    Math.round((totalSalary / totalHours + Number.EPSILON) * 100) / 100;

  return {
    hourly_rate,
    total_salary_base:
      Math.round((totalSalary + Number.EPSILON) * 100) / 100,
    total_hours_base: totalHours,
  };
}

export async function upsertLaborCostRow(
  client: SupabaseClient<Database>,
  tenantId: string,
  work_center_id: string,
  year: number,
  month: number,
  snapshot: LaborCostSnapshot
): Promise<void> {
  const { error } = await client.from("labor_costs").upsert(
    {
      tenant_id: tenantId,
      work_center_id,
      year,
      month,
      hourly_rate: snapshot.hourly_rate,
      total_salary_base: snapshot.total_salary_base,
      total_hours_base: snapshot.total_hours_base,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,work_center_id,year,month" }
  );

  if (error) throw new Error(error.message);
}

/** Último registo de custo/hora calculado para a linha (qualquer mês). */
export async function getLatestLaborHourlyRateForWorkCenter(
  client: SupabaseClient<Database>,
  tenantId: string,
  workCenterId: string
): Promise<number | null> {
  const { data, error } = await client
    .from("labor_costs")
    .select("hourly_rate, year, month")
    .eq("tenant_id", tenantId)
    .eq("work_center_id", workCenterId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.hourly_rate == null) return null;
  return Number(data.hourly_rate);
}
