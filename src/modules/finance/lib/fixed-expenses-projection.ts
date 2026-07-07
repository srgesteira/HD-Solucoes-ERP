export type FixedExpenseProjectionRow = {
  id: string;
  amount: number;
  due_day: number;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
};

export type FixedExpenseOverrideRow = {
  fixed_expense_id: string;
  competencia: string;
  amount: number;
};

/** Último dia válido do mês para due_day (ex.: 31 → 28/29 em fev, 30 em abril). */
export function dueDateInMonth(year: number, month: number, dueDay: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function competenciaFromYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function advanceMonth(year: number, month: number): { year: number; month: number } {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/**
 * Projeta saídas mensais de contas fixas no mapa dia→valor do fluxo.
 * Respeita start_date/end_date, overrides por competência e due_day clamped.
 */
export function projectFixedExpensesToOutByDay(
  outByDay: Map<string, number>,
  expenses: FixedExpenseProjectionRow[],
  overrides: FixedExpenseOverrideRow[],
  horizonStart: Date,
  horizonDays: number
): void {
  const overrideByKey = new Map<string, number>();
  for (const o of overrides) {
    overrideByKey.set(`${o.fixed_expense_id}|${o.competencia}`, Number(o.amount));
  }

  const rangeStart = horizonStart.toISOString().slice(0, 10);
  const rangeEndDate = new Date(horizonStart);
  rangeEndDate.setDate(rangeEndDate.getDate() + horizonDays);
  const rangeEnd = rangeEndDate.toISOString().slice(0, 10);

  let y = horizonStart.getFullYear();
  let m = horizonStart.getMonth() + 1;
  const endY = rangeEndDate.getFullYear();
  const endM = rangeEndDate.getMonth() + 1;

  const months: Array<{ year: number; month: number }> = [];
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m });
    ({ year: y, month: m } = advanceMonth(y, m));
  }

  for (const exp of expenses) {
    if (!exp.is_active) continue;
    const expStart = exp.start_date.slice(0, 10);
    const expEnd = exp.end_date?.slice(0, 10) ?? null;
    const baseAmount = Number(exp.amount);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) continue;

    for (const { year, month } of months) {
      const dateKey = dueDateInMonth(year, month, exp.due_day);
      if (dateKey < expStart) continue;
      if (expEnd && dateKey > expEnd) continue;
      if (dateKey < rangeStart || dateKey > rangeEnd) continue;

      const competencia = competenciaFromYearMonth(year, month);
      const amt =
        overrideByKey.get(`${exp.id}|${competencia}`) ?? baseAmount;
      if (!Number.isFinite(amt) || amt <= 0) continue;
      outByDay.set(dateKey, (outByDay.get(dateKey) ?? 0) + amt);
    }
  }
}
