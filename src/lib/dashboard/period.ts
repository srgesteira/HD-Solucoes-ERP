import {
  addDaysIso as addDaysIsoFromRange,
  currentMonthRange,
} from "@/lib/dashboard/month-range";

/** Reexport explícito (compatível com Turbopack em rotas API). */
export function addDaysIso(iso: string, days: number): string {
  return addDaysIsoFromRange(iso, days);
}

export { currentMonthRange };

export type DashboardPeriodRange = {
  from: string;
  to: string;
  /** `month` = mês corrente ou mês indicado; `90d` = últimos 90 dias. */
  kind: "month" | "90d";
};

/** Últimos 90 dias até hoje (para lead time de compras, etc.). */
export function last90DaysRange(): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  return { from: addDaysIsoFromRange(to, -90), to };
}

/**
 * `period=90d` → últimos 90 dias.
 * `period=YYYY-MM` → mês específico.
 * Omitido → mês corrente.
 */
export function parseDashboardPeriod(
  searchParams: URLSearchParams
): DashboardPeriodRange {
  const period = searchParams.get("period");
  if (period === "90d") {
    const { from, to } = last90DaysRange();
    return { from, to, kind: "90d" };
  }
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from, to, kind: "month" };
  }
  const { from, to } = currentMonthRange();
  return { from, to, kind: "month" };
}

export function daysBetweenIso(start: string, end: string): number {
  const a = new Date(`${start.slice(0, 10)}T12:00:00.000Z`);
  const b = new Date(`${end.slice(0, 10)}T12:00:00.000Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function hoursBetweenTimestamps(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / 3_600_000;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
