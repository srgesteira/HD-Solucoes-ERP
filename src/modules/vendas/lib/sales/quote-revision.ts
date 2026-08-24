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

/** Estados em que guardar conteúdo reabre o orçamento como rascunho (sem subir revisão). */
export const QUOTE_REOPEN_AS_DRAFT_STATUSES = [
  "sent",
  "approved",
  "revision",
] as const;

export function quoteStatusReopensAsDraftOnContentSave(
  status: string,
): boolean {
  return (QUOTE_REOPEN_AS_DRAFT_STATUSES as readonly string[]).includes(
    status
  );
}

/**
 * @deprecated Revisão deixa de subir ao guardar conteúdo — sobe só no reenvio.
 * Mantido para não partir imports; sempre false.
 */
export function quoteStatusBumpsRevisionOnContentSave(
  _status: string,
): boolean {
  return false;
}

/** Reenvio (já tinha send_count >= 1) → incrementa revision_number. */
export function nextRevisionOnSend(params: {
  sendCount: number | null | undefined;
  revisionNumber: number | null | undefined;
}): { send_count: number; revision_number: number; bumpsRevision: boolean } {
  const prevSend = Math.max(0, Math.trunc(Number(params.sendCount ?? 0) || 0));
  const prevRev = Math.max(
    0,
    Math.trunc(Number(params.revisionNumber ?? 0) || 0)
  );
  const bumpsRevision = prevSend >= 1;
  return {
    send_count: prevSend + 1,
    revision_number: bumpsRevision ? prevRev + 1 : prevRev,
    bumpsRevision,
  };
}
