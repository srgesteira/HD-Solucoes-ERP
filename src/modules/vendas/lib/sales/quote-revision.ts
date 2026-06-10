/** Sufixo de revisão para título do orçamento (rev01, rev02, …). */
export function formatQuoteRevisionSuffix(
  revisionNumber: number | null | undefined,
): string {
  const n = Number(revisionNumber ?? 0);
  if (!Number.isFinite(n) || n < 1) return "";
  return ` - rev${String(Math.trunc(n)).padStart(2, "0")}`;
}

export function formatQuoteNumberWithRevision(
  quoteNumber: string,
  revisionNumber?: number | null,
): string {
  return `${quoteNumber}${formatQuoteRevisionSuffix(revisionNumber)}`;
}

export function formatQuoteDisplayTitle(
  quoteNumber: string,
  revisionNumber?: number | null,
): string {
  return `Orçamento ${formatQuoteNumberWithRevision(quoteNumber, revisionNumber)}`;
}

/** Estados em que guardar conteúdo incrementa o número de revisão. */
export const QUOTE_REVISION_BUMP_STATUSES = [
  "sent",
  "approved",
  "revision",
] as const;

export function quoteStatusBumpsRevisionOnContentSave(
  status: string,
): boolean {
  return (QUOTE_REVISION_BUMP_STATUSES as readonly string[]).includes(status);
}
