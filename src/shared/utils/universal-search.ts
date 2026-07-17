/**
 * Utilitários de busca universal para o ERP.
 * Aceita texto livre, datas (dd/mm/aaaa ou aaaa-mm-dd) e códigos.
 *
 * Busca inteligente: vários tokens (ex. "filtro h14") exigem que TODOS
 * apareçam nos campos (AND), em qualquer ordem — não a frase contígua.
 */

export function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Tokens de busca (espaços); remove vazios. */
export function tokenizeSearch(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Cliente: todos os tokens devem aparecer no haystack concatenado dos campos.
 * Ex.: "filtro h14" casa com "Filtro Cunha h14".
 */
export function matchesTokenSearch(
  query: string | null | undefined,
  fields: Array<string | number | null | undefined>
): boolean {
  const tokens = tokenizeSearch(query);
  if (!tokens.length) return true;
  const hay = fields
    .filter((v) => v != null && v !== "")
    .map((v) => String(v).toLowerCase())
    .join(" ");
  return tokens.every((t) => hay.includes(t.toLowerCase()));
}

/**
 * Filtro PostgREST para `.or(...)`:
 * - 1 token → `field1.ilike.%t%,field2.ilike.%t%`
 * - N tokens → `and(or(fields t1),or(fields t2),...)` (todos os tokens em algum campo)
 */
export function buildTokenAndFieldIlikeOrFilter(
  fields: string[],
  raw: string | null | undefined
): string | null {
  const tokens = tokenizeSearch(raw);
  if (!tokens.length || fields.length === 0) return null;

  if (tokens.length === 1) {
    const safe = `%${escapeIlike(tokens[0]!)}%`;
    return fields.map((f) => `${f}.ilike.${safe}`).join(",");
  }

  const parts = tokens.map((t) => {
    const safe = `%${escapeIlike(t)}%`;
    return `or(${fields.map((f) => `${f}.ilike.${safe}`).join(",")})`;
  });
  return `and(${parts.join(",")})`;
}

/**
 * Aplica AND de tokens via vários `.or(field1|field2…)` encadeados
 * (filtros Supabase são ANDados entre si).
 */
export function applyTokenFieldIlikeOrFilters<
  T extends { or: (filters: string) => T },
>(query: T, fields: string[], raw: string | null | undefined): T {
  const tokens = tokenizeSearch(raw);
  if (!tokens.length || fields.length === 0) return query;
  let q = query;
  for (const token of tokens) {
    const safe = `%${escapeIlike(token)}%`;
    q = q.or(fields.map((f) => `${f}.ilike.${safe}`).join(","));
  }
  return q;
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

  const all = [...fields, ...nestedTexts];

  if (matchesTokenSearch(hint.text, all)) return true;

  if (hint.isoDate) {
    const iso = hint.isoDate;
    const values = all
      .filter((v) => v != null && v !== "")
      .map((v) => String(v).toLowerCase());
    return values.some((v) => v.startsWith(iso) || v.includes(iso));
  }

  return false;
}
