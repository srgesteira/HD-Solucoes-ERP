/** Parse campos de parcelamento (orçamento / pedido). */
export function parsePaymentInt(
  raw: unknown,
  field: string,
  def: number,
  min = 0
): number | { error: string } {
  if (raw === undefined || raw === null) return def;
  const v =
    typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(v) || v < min) {
    return { error: `Campo ${field} inválido` };
  }
  return v;
}

export function parseOptionalIsoDate(
  raw: unknown
): string | null | { error: string } {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { error: "Data inválida (use AAAA-MM-DD)" };
  }
  return s;
}
