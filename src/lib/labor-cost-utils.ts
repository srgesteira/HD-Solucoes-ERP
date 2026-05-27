import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  getEmployeeMonthSlices,
  sliceCost,
  type EmployeeMonthSlice,
} from "@/lib/labor-allocation-period";
import {
  getPurchaseOrderWeightPerLine,
  getStubDriverWeights,
  type AllocationDriver,
} from "@/lib/labor-cost-drivers";

type Admin = SupabaseClient<Database>;

export type LaborCostSnapshot = {
  hourly_rate: number;
  total_salary_base: number;
  total_hours_base: number;
  direct_cost: number;
  allocated_cost: number;
  direct_hourly_rate: number;
  allocated_hourly_rate: number;
};

export type LineLaborAllocation = {
  work_center_id: string;
  direct_cost: number;
  allocated_cost: number;
  total_hours: number;
  direct_hourly_rate: number;
  allocated_hourly_rate: number;
  hourly_rate: number;
};

export type DepartmentAllocationDetail = {
  department_id: string;
  department_code: string;
  department_name: string;
  allocation_driver: AllocationDriver;
  total_cost: number;
  by_line: Array<{ work_center_id: string; amount: number }>;
};

export type LaborCostBreakdown = {
  year: number;
  month: number;
  lines: LineLaborAllocation[];
  departments: DepartmentAllocationDetail[];
};

const DEFAULT_MONTHLY_HOURS = 220;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function allocFactor(pct: number | null | undefined): number {
  const p = Number(pct ?? 100);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(p, 100) / 100;
}

async function loadMonthSlices(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<EmployeeMonthSlice[]> {
  return getEmployeeMonthSlices(admin, tenantId, year, month);
}

async function loadSupportDepartments(admin: Admin, tenantId: string) {
  const { data, error } = await admin
    .from("departments")
    .select("id, code, name, is_support, allocation_driver, driver_config")
    .eq("tenant_id", tenantId)
    .eq("is_support", true);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getWorkCenterMonthlyHours(
  admin: Admin,
  tenantId: string,
  workCenterId: string
): Promise<number> {
  const { data } = await admin
    .from("work_centers")
    .select("default_monthly_hours")
    .eq("id", workCenterId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const h = Number(data?.default_monthly_hours ?? 0);
  return h > 0 ? h : DEFAULT_MONTHLY_HOURS;
}

async function loadSupportDepartmentIds(
  admin: Admin,
  tenantId: string
): Promise<Set<string>> {
  const depts = await loadSupportDepartments(admin, tenantId);
  return new Set(depts.map((d) => d.id));
}

/** Custo salarial directo da linha no mês (alocações temporárias + padrão). */
export async function getLineDirectCost(
  admin: Admin,
  tenantId: string,
  lineId: string,
  year: number,
  month: number
): Promise<number> {
  const slices = await loadMonthSlices(admin, tenantId, year, month);
  let total = 0;
  for (const s of slices) {
    if (s.work_center_id !== lineId) continue;
    total += sliceCost(s);
  }
  return round2(total);
}

/** Horas da linha com prorrateio por período. */
export async function getLineTotalHours(
  admin: Admin,
  tenantId: string,
  lineId: string,
  year: number,
  month: number
): Promise<number> {
  const slices = await loadMonthSlices(admin, tenantId, year, month);
  const monthlyHours = await getWorkCenterMonthlyHours(admin, tenantId, lineId);
  let total = 0;
  for (const s of slices) {
    if (s.work_center_id !== lineId) continue;
    total +=
      monthlyHours *
      s.month_fraction *
      allocFactor(s.allocation_percentage);
  }
  return Math.round(total);
}

/** Custos de apoio sem linha (todos os departamentos de apoio). */
export async function getSupportDepartmentsCost(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<number> {
  const byDept = await getSupportCostByDepartment(admin, tenantId, year, month);
  let sum = 0;
  for (const v of byDept.values()) sum += v;
  return round2(sum);
}

/** Custo por departamento de apoio (colaboradores sem linha no período). */
export async function getSupportCostByDepartment(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<Map<string, number>> {
  const slices = await loadMonthSlices(admin, tenantId, year, month);
  const supportIds = await loadSupportDepartmentIds(admin, tenantId);
  const costs = new Map<string, number>();

  for (const s of slices) {
    if (s.work_center_id) continue;
    if (!s.department_id || !supportIds.has(s.department_id)) continue;
    costs.set(
      s.department_id,
      (costs.get(s.department_id) ?? 0) + sliceCost(s)
    );
  }

  for (const [k, v] of costs) {
    costs.set(k, round2(v));
  }
  return costs;
}

export async function getTotalLineHoursAllLines(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<number> {
  const { data: lines, error } = await admin
    .from("work_centers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  let sum = 0;
  for (const line of lines ?? []) {
    sum += await getLineTotalHours(admin, tenantId, line.id, year, month);
  }
  return sum;
}

async function getHoursWeightsPerLine(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number,
  lineIds: string[]
): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  for (const id of lineIds) {
    const h = await getLineTotalHours(admin, tenantId, id, year, month);
    if (h > 0) weights.set(id, h);
  }
  return weights;
}

async function getDriverWeights(
  admin: Admin,
  tenantId: string,
  driver: AllocationDriver,
  year: number,
  month: number,
  lineIds: string[]
): Promise<Map<string, number>> {
  switch (driver) {
    case "purchase_orders":
      return getPurchaseOrderWeightPerLine(admin, tenantId, year, month);
    case "shipped_weight":
    case "movements_count":
      return getStubDriverWeights(admin, tenantId);
    case "hours":
    default:
      return getHoursWeightsPerLine(admin, tenantId, year, month, lineIds);
  }
}

function distributeByWeights(
  totalCost: number,
  weights: Map<string, number>,
  fallbackLineIds: string[] = []
): Map<string, number> {
  const result = new Map<string, number>();
  let sumW = 0;
  for (const w of weights.values()) sumW += w;
  if (sumW <= 0 && fallbackLineIds.length > 0 && totalCost > 0) {
    const share = 1 / fallbackLineIds.length;
    for (const id of fallbackLineIds) {
      result.set(id, round2(totalCost * share));
    }
    return result;
  }
  if (sumW <= 0 || totalCost <= 0) return result;
  for (const [lineId, w] of weights) {
    result.set(lineId, round2(totalCost * (w / sumW)));
  }
  return result;
}

/** Breakdown completo sem gravar (útil para dashboard). */
export async function computeLaborCostBreakdown(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<LaborCostBreakdown> {
  const { data: lines, error: lErr } = await admin
    .from("work_centers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (lErr) throw new Error(lErr.message);

  const lineIds = (lines ?? []).map((l) => l.id);
  const supportDepts = await loadSupportDepartments(admin, tenantId);
  const deptCosts = await getSupportCostByDepartment(
    admin,
    tenantId,
    year,
    month
  );

  const allocatedByLine = new Map<string, number>();
  for (const id of lineIds) allocatedByLine.set(id, 0);

  const departmentDetails: DepartmentAllocationDetail[] = [];

  for (const dept of supportDepts) {
    const cost = deptCosts.get(dept.id) ?? 0;
    if (cost <= 0) continue;

    const driver = (dept.allocation_driver ??
      "hours") as AllocationDriver;
    const weights = await getDriverWeights(
      admin,
      tenantId,
      driver,
      year,
      month,
      lineIds
    );
    const dist = distributeByWeights(cost, weights, lineIds);
    const byLine: Array<{ work_center_id: string; amount: number }> = [];

    for (const [wcId, amount] of dist) {
      allocatedByLine.set(
        wcId,
        round2((allocatedByLine.get(wcId) ?? 0) + amount)
      );
      byLine.push({ work_center_id: wcId, amount });
    }

    departmentDetails.push({
      department_id: dept.id,
      department_code: dept.code,
      department_name: dept.name,
      allocation_driver: driver,
      total_cost: cost,
      by_line: byLine,
    });
  }

  const lineResults: LineLaborAllocation[] = [];

  for (const lineId of lineIds) {
    const directCost = await getLineDirectCost(
      admin,
      tenantId,
      lineId,
      year,
      month
    );
    const hours = await getLineTotalHours(admin, tenantId, lineId, year, month);
    const allocatedCost = allocatedByLine.get(lineId) ?? 0;
    const finalCost = round2(directCost + allocatedCost);
    const directHourly = hours > 0 ? round2(directCost / hours) : 0;
    const allocatedHourly = hours > 0 ? round2(allocatedCost / hours) : 0;
    const hourlyRate = hours > 0 ? round2(finalCost / hours) : 0;

    lineResults.push({
      work_center_id: lineId,
      direct_cost: directCost,
      allocated_cost: allocatedCost,
      total_hours: hours,
      direct_hourly_rate: directHourly,
      allocated_hourly_rate: allocatedHourly,
      hourly_rate: hourlyRate,
    });
  }

  return {
    year,
    month,
    lines: lineResults,
    departments: departmentDetails,
  };
}

/** Rateio por departamento + custo directo; grava em `labor_costs`. */
export async function calculateHourlyRateWithAllocation(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<LineLaborAllocation[]> {
  const breakdown = await computeLaborCostBreakdown(
    admin,
    tenantId,
    year,
    month
  );

  for (const line of breakdown.lines) {
    const snapshot: LaborCostSnapshot = {
      hourly_rate: line.hourly_rate,
      total_salary_base: round2(line.direct_cost + line.allocated_cost),
      total_hours_base: line.total_hours,
      direct_cost: line.direct_cost,
      allocated_cost: line.allocated_cost,
      direct_hourly_rate: line.direct_hourly_rate,
      allocated_hourly_rate: line.allocated_hourly_rate,
    };
    await upsertLaborCostRow(
      admin,
      tenantId,
      line.work_center_id,
      year,
      month,
      snapshot
    );
  }

  return breakdown.lines;
}

export async function calculateLaborCostForWorkCenter(
  admin: Admin,
  tenantId: string,
  work_center_id: string
): Promise<LaborCostSnapshot | null> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const directCost = await getLineDirectCost(
    admin,
    tenantId,
    work_center_id,
    y,
    m
  );
  const hours = await getLineTotalHours(
    admin,
    tenantId,
    work_center_id,
    y,
    m
  );
  if (hours <= 0) return null;
  const directHourly = round2(directCost / hours);
  return {
    hourly_rate: directHourly,
    total_salary_base: directCost,
    total_hours_base: hours,
    direct_cost: directCost,
    allocated_cost: 0,
    direct_hourly_rate: directHourly,
    allocated_hourly_rate: 0,
  };
}

export async function upsertLaborCostRow(
  admin: Admin,
  tenantId: string,
  work_center_id: string,
  year: number,
  month: number,
  snapshot: LaborCostSnapshot
): Promise<void> {
  const { error } = await admin.from("labor_costs").upsert(
    {
      tenant_id: tenantId,
      work_center_id,
      year,
      month,
      hourly_rate: snapshot.hourly_rate,
      total_salary_base: snapshot.total_salary_base,
      total_hours_base: snapshot.total_hours_base,
      direct_cost: snapshot.direct_cost,
      allocated_cost: snapshot.allocated_cost,
      direct_hourly_rate: snapshot.direct_hourly_rate,
      allocated_hourly_rate: snapshot.allocated_hourly_rate,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,work_center_id,year,month" }
  );

  if (error) throw new Error(error.message);
}

export async function getLaborCostForWorkCenterPeriod(
  admin: Admin,
  tenantId: string,
  workCenterId: string,
  year: number,
  month: number
): Promise<LaborCostSnapshot | null> {
  const { data, error } = await admin
    .from("labor_costs")
    .select(
      "hourly_rate, total_salary_base, total_hours_base, direct_cost, allocated_cost, direct_hourly_rate, allocated_hourly_rate"
    )
    .eq("tenant_id", tenantId)
    .eq("work_center_id", workCenterId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    hourly_rate: Number(data.hourly_rate),
    total_salary_base: Number(data.total_salary_base),
    total_hours_base: Number(data.total_hours_base),
    direct_cost: Number(data.direct_cost ?? 0),
    allocated_cost: Number(data.allocated_cost ?? 0),
    direct_hourly_rate: Number(data.direct_hourly_rate ?? data.hourly_rate),
    allocated_hourly_rate: Number(data.allocated_hourly_rate ?? 0),
  };
}

export async function getLatestLaborHourlyRateForWorkCenter(
  admin: Admin,
  tenantId: string,
  workCenterId: string
): Promise<number | null> {
  const { data, error } = await admin
    .from("labor_costs")
    .select("hourly_rate, year, month")
    .eq("tenant_id", tenantId)
    .eq("work_center_id", workCenterId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.hourly_rate == null) return null;
  return Number(data.hourly_rate);
}

export async function getLaborHourlyRateForProductionLine(
  admin: Admin,
  tenantId: string,
  productionLineId: string,
  year?: number,
  month?: number
): Promise<number | null> {
  const { data: pl } = await admin
    .from("production_lines")
    .select("work_center_id")
    .eq("id", productionLineId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const wcId = pl?.work_center_id;
  if (!wcId) return null;

  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  const period = await getLaborCostForWorkCenterPeriod(
    admin,
    tenantId,
    wcId,
    y,
    m
  );
  if (period?.hourly_rate != null && period.hourly_rate > 0) {
    return period.hourly_rate;
  }

  return getLatestLaborHourlyRateForWorkCenter(admin, tenantId, wcId);
}

export async function resolveWorkCenterIdForProductionLine(
  admin: Admin,
  tenantId: string,
  productionLineId: string
): Promise<string | null> {
  const { data } = await admin
    .from("production_lines")
    .select("work_center_id")
    .eq("id", productionLineId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data?.work_center_id ?? null;
}

export async function resolveLaborHourlyRateForBom(
  admin: Admin,
  tenantId: string,
  opts: {
    work_center_id: string | null;
    production_line_id?: string | null;
    year?: number;
    month?: number;
  }
): Promise<number> {
  const plId = opts.production_line_id?.trim();
  if (plId) {
    const fromLine = await getLaborHourlyRateForProductionLine(
      admin,
      tenantId,
      plId,
      opts.year,
      opts.month
    );
    if (fromLine != null && fromLine > 0) return fromLine;
  }

  const wcId = opts.work_center_id?.trim();
  if (!wcId) return 0;

  const now = new Date();
  const y = opts.year ?? now.getFullYear();
  const m = opts.month ?? now.getMonth() + 1;

  const period = await getLaborCostForWorkCenterPeriod(
    admin,
    tenantId,
    wcId,
    y,
    m
  );
  if (period?.hourly_rate != null && period.hourly_rate > 0) {
    return period.hourly_rate;
  }

  const latest = await getLatestLaborHourlyRateForWorkCenter(
    admin,
    tenantId,
    wcId
  );
  if (latest != null && latest > 0) return latest;

  const { data: wc } = await admin
    .from("work_centers")
    .select("hourly_cost")
    .eq("id", wcId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return Number(wc?.hourly_cost ?? 0);
}

export { getPurchaseOrderWeightPerLine } from "@/lib/labor-cost-drivers";
