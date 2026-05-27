import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

export type EmployeeMonthSlice = {
  employee_id: string;
  monthly_salary: number;
  work_center_id: string | null;
  department_id: string | null;
  allocation_percentage: number;
  /** Fração do salário mensal atribuída a este slice (0–1). */
  month_fraction: number;
};

function allocFactor(pct: number | null | undefined): number {
  const p = Number(pct ?? 100);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(p, 100) / 100;
}

export function monthBounds(
  year: number,
  month: number
): { firstDay: string; lastDay: string; daysInMonth: number } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstDay = `${year}-${pad(month)}-01`;
  const lastDay = `${year}-${pad(month)}-${pad(last.getDate())}`;
  return { firstDay, lastDay, daysInMonth: last.getDate() };
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Dias de sobreposição entre [aStart,aEnd] e [bStart,bEnd] (inclusive). */
export function overlapDaysInclusive(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string
): number {
  const start = parseDate(aStart > bStart ? aStart : bStart);
  const endA = aEnd ? parseDate(aEnd) : parseDate("9999-12-31");
  const endB = parseDate(bEnd);
  const end = endA < endB ? endA : endB;
  if (end < start) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

type EmployeeDefault = {
  id: string;
  monthly_salary: number | null;
  work_center_id: string | null;
  department_id: string | null;
  allocation_percentage: number | null;
};

type PeriodAllocRow = {
  employee_id: string;
  work_center_id: string | null;
  department_id: string | null;
  allocation_percentage: number;
  start_date: string;
  end_date: string | null;
};

/**
 * Slices efectivos por colaborador no mês: alocações temporárias com prorrateio por dias;
 * sem registos no período, usa dados padrão de `employees`.
 */
export async function getEmployeeMonthSlices(
  admin: Admin,
  tenantId: string,
  year: number,
  month: number
): Promise<EmployeeMonthSlice[]> {
  const { firstDay, lastDay, daysInMonth } = monthBounds(year, month);

  const { data: employees, error: eErr } = await admin
    .from("employees")
    .select(
      "id, monthly_salary, work_center_id, department_id, allocation_percentage"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (eErr) throw new Error(eErr.message);

  const { data: periodRows, error: pErr } = await admin
    .from("employee_allocations")
    .select(
      "employee_id, work_center_id, department_id, allocation_percentage, start_date, end_date"
    )
    .eq("tenant_id", tenantId)
    .lte("start_date", lastDay)
    .or(`end_date.is.null,end_date.gte.${firstDay}`);

  if (pErr) throw new Error(pErr.message);

  const byEmployee = new Map<string, PeriodAllocRow[]>();
  for (const row of (periodRows ?? []) as PeriodAllocRow[]) {
    const list = byEmployee.get(row.employee_id) ?? [];
    list.push(row);
    byEmployee.set(row.employee_id, list);
  }

  const slices: EmployeeMonthSlice[] = [];

  for (const emp of (employees ?? []) as EmployeeDefault[]) {
    const salary = Number(emp.monthly_salary ?? 0);
    if (salary <= 0) continue;

    const periodAllocs = byEmployee.get(emp.id) ?? [];

    if (periodAllocs.length === 0) {
      slices.push({
        employee_id: emp.id,
        monthly_salary: salary,
        work_center_id: emp.work_center_id,
        department_id: emp.department_id,
        allocation_percentage: Number(emp.allocation_percentage ?? 100),
        month_fraction: 1,
      });
      continue;
    }

    let totalFrac = 0;
    const empSlices: EmployeeMonthSlice[] = [];

    for (const a of periodAllocs) {
      const days = overlapDaysInclusive(
        a.start_date,
        a.end_date,
        firstDay,
        lastDay
      );
      if (days <= 0) continue;
      const frac = days / daysInMonth;
      totalFrac += frac;
      empSlices.push({
        employee_id: emp.id,
        monthly_salary: salary,
        work_center_id: a.work_center_id,
        department_id: a.department_id,
        allocation_percentage: Number(a.allocation_percentage),
        month_fraction: frac,
      });
    }

    if (empSlices.length === 0) {
      slices.push({
        employee_id: emp.id,
        monthly_salary: salary,
        work_center_id: emp.work_center_id,
        department_id: emp.department_id,
        allocation_percentage: Number(emp.allocation_percentage ?? 100),
        month_fraction: 1,
      });
      continue;
    }

    const norm = totalFrac > 1 ? 1 / totalFrac : 1;
    for (const s of empSlices) {
      slices.push({
        ...s,
        month_fraction: s.month_fraction * norm,
      });
    }
  }

  return slices;
}

/** Custo efectivo do slice (salário × dias no mês × % alocação). */
export function sliceCost(s: EmployeeMonthSlice): number {
  return (
    s.monthly_salary *
    s.month_fraction *
    allocFactor(s.allocation_percentage)
  );
}
