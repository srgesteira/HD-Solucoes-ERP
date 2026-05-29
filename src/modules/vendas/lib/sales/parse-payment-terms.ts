/** Resultado ao inferir parcelamento a partir do texto de condições de pagamento. */
export type ParsedPaymentTerms = {
  installments: number;
  daysToFirstDue: number;
  daysBetweenInstallments: number;
};

/**
 * Interpreta condições de pagamento em texto livre.
 * Ex.: `28ddf`, `28 DDL`, `30/60/90`, `à vista`, `45 dias`.
 */
export function parsePaymentTermsFromText(raw: string): ParsedPaymentTerms | null {
  const t = raw.trim();
  if (!t) return null;

  const lower = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  if (/^(a\s*vista|avista|vista|0\s*(?:ddf|ddl)?)$/.test(lower)) {
    return {
      installments: 1,
      daysToFirstDue: 0,
      daysBetweenInstallments: 0,
    };
  }

  const slashParts = t.split("/").map((s) => s.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const days = slashParts.map((part) => {
      const m = part.match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : NaN;
    });
    if (
      days.length === slashParts.length &&
      days.every((n) => Number.isFinite(n) && n >= 0)
    ) {
      const daysBetween =
        days.length > 1 ? Math.max(0, days[1] - days[0]) : 0;
      return {
        installments: days.length,
        daysToFirstDue: days[0],
        daysBetweenInstallments: daysBetween,
      };
    }
  }

  const singleDdf = lower.match(/^(\d+)\s*(?:ddf|ddl)\b/);
  if (singleDdf) {
    const d = parseInt(singleDdf[1], 10);
    return {
      installments: 1,
      daysToFirstDue: d,
      daysBetweenInstallments: 0,
    };
  }

  const singleDias = lower.match(/^(\d+)\s*dias?\b/);
  if (singleDias) {
    const d = parseInt(singleDias[1], 10);
    return {
      installments: 1,
      daysToFirstDue: d,
      daysBetweenInstallments: 0,
    };
  }

  const onlyNumber = lower.match(/^(\d+)$/);
  if (onlyNumber) {
    const d = parseInt(onlyNumber[1], 10);
    return {
      installments: 1,
      daysToFirstDue: d,
      daysBetweenInstallments: 0,
    };
  }

  return null;
}
