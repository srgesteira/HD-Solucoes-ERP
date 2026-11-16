/**
 * Lista de e-mails gravada num único campo (ex.: e-mail do fornecedor).
 * Aceita separadores ";", "," ou espaço. Devolve únicos, sem vazios.
 */
export function splitEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[;,\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"))
    ),
  ];
}

/** Normaliza para gravar: "a@x.com; b@y.com". */
export function normalizeEmailList(raw: string | null | undefined): string | null {
  const list = splitEmailList(raw);
  return list.length ? list.join("; ") : null;
}
