export type SortableColumnType = "text" | "number" | "date";

export type SortDirection = "asc" | "desc";

/** Converte "R$ 2.204,01", "2204,01" ou número em valor numérico. */
export function parseSortableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  let s = String(value).trim();
  if (!s || s === "—") return null;

  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  s = s.replace(/[^\d.-]/g, "");
  if (!s || s === "-" || s === ".") return null;

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Aceita ISO (aaaa-mm-dd), dd/mm/aaaa ou timestamp. */
export function parseSortableDate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }

  const s = String(value).trim();
  if (!s || s === "—") return null;

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) {
    const [, day, month, year] = br;
    const t = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(t) ? null : t;
  }

  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    return Number.isNaN(t) ? null : t;
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

export function compareSortableValues(
  a: unknown,
  b: unknown,
  type: SortableColumnType,
  direction: SortDirection
): number {
  const factor = direction === "asc" ? 1 : -1;

  if (type === "number") {
    const na = parseSortableNumber(a);
    const nb = parseSortableNumber(b);
    if (na === null && nb === null) return 0;
    if (na === null) return 1 * factor;
    if (nb === null) return -1 * factor;
    if (na === nb) return 0;
    return na < nb ? -1 * factor : 1 * factor;
  }

  if (type === "date") {
    const da = parseSortableDate(a);
    const db = parseSortableDate(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1 * factor;
    if (db === null) return -1 * factor;
    if (da === db) return 0;
    return da < db ? -1 * factor : 1 * factor;
  }

  const sa = a === null || a === undefined ? "" : String(a);
  const sb = b === null || b === undefined ? "" : String(b);
  return sa.localeCompare(sb, "pt-BR", { sensitivity: "base" }) * factor;
}
