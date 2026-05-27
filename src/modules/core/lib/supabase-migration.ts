/** Erros PostgREST/Supabase quando uma tabela ainda não existe (migration não aplicada). */
export function isMissingPublicTableError(
  message: string | undefined,
  tableName: string
): boolean {
  const m = (message ?? "").toLowerCase();
  const t = tableName.toLowerCase();
  if (!m.includes(t)) return false;
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes(t))
  );
}
