/** Início e fim do mês corrente (ISO date YYYY-MM-DD). */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
