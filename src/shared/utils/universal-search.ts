/**
 * Utilitários de busca universal para cronogramas do ERP.
 * Aceita texto livre, datas (dd/mm/aaaa ou aaaa-mm-dd) e códigos.
 */

export function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Converte dd/mm/aaaa, dd-mm-aaaa ou aaaa-mm-dd para ISO (aaaa-mm-dd). */
export function extractIsoDateFromSearch(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const day = br[1]!.padStart(2, "0");
    const month = br[2]!.padStart(2, "0");
    let year = br[3]!;
    if (year.length === 2) year = `20${year}`;
    if (year.length !== 4) return null;
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function normalizeUniversalSearch(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

export type UniversalSearchHint = {
  text: string;
  isoDate: string | null;
};

export function parseUniversalSearch(raw: string | null | undefined): UniversalSearchHint {
  const text = normalizeUniversalSearch(raw);
  return {
    text,
    isoDate: extractIsoDateFromSearch(text),
  };
}

/** Filtra linhas no cliente quando a API devolve o conjunto completo. */
export function matchesUniversalSearchRow(
  hint: UniversalSearchHint,
  fields: Array<string | number | null | undefined>,
  nestedTexts: string[] = []
): boolean {
  if (!hint.text) return true;

  const needle = hint.text.toLowerCase();
  const all = [...fields, ...nestedTexts]
    .filter((v) => v != null && v !== "")
    .map((v) => String(v).toLowerCase());

  if (all.some((v) => v.includes(needle))) return true;

  if (hint.isoDate) {
    const iso = hint.isoDate;
    return all.some((v) => v.startsWith(iso) || v.includes(iso));
  }

  return false;
}
