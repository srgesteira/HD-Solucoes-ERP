/** Normaliza vírgula para ponto (apenas o primeiro separador decimal). */
export function normalizeDecimalTyping(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withDot = trimmed.replace(",", ".");
  const parts = withDot.split(".");
  if (parts.length <= 2) return withDot;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

/** Valida texto parcial ou final durante digitação. */
export function isValidDecimalTyping(
  normalized: string,
  maxDecimals: number
): boolean {
  if (normalized === "") return true;
  const re = new RegExp(`^\\d*(?:\\.\\d{0,${maxDecimals}})?$`);
  return re.test(normalized);
}

export function parseDecimalInput(
  raw: string,
  fallback = 0
): number {
  const norm = normalizeDecimalTyping(raw);
  if (norm === "" || norm === ".") return fallback;
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : fallback;
}

/** Exibição pt-BR quando o campo não está focado. */
export function formatDecimalDisplay(
  value: number,
  maxDecimals: number
): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/** Texto inicial ao focar (sem separador de milhares). */
export function decimalToFocusString(
  value: number,
  maxDecimals: number
): string {
  if (!Number.isFinite(value) || value === 0) return "";
  const fixed = value.toFixed(maxDecimals);
  const trimmed = fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return trimmed.replace(".", ",");
}

export function isValidIntegerTyping(raw: string): boolean {
  if (raw === "") return true;
  return /^\d+$/.test(raw);
}

export function parseIntegerInput(raw: string, fallback = 0): number {
  const t = raw.trim();
  if (!t) return fallback;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : fallback;
}
