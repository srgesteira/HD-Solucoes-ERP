/** Código curto usado em famílias, materiais, acabamentos e sufixos. */
export const CLASSIFICATION_CATALOG_CODE_RE = /^[A-Z0-9]{1,4}$/;

export function normalizeClassificationCatalogCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateClassificationCatalogCode(
  raw: string
): string | null {
  const code = normalizeClassificationCatalogCode(raw);
  if (!code) return "Código é obrigatório.";
  if (!CLASSIFICATION_CATALOG_CODE_RE.test(code)) {
    return "Código inválido. Use 1 a 4 letras ou números (ex.: A, PN, 10).";
  }
  return null;
}

/** Sufixo novo no cadastro: mínimo 2 caracteres (evita colidir com material A). */
export function validatePrefixCatalogCode(raw: string): string | null {
  const code = normalizeClassificationCatalogCode(raw);
  if (!code) return "Código do sufixo é obrigatório.";
  if (!/^[A-Z0-9]{2,4}$/.test(code)) {
    return "Código do sufixo inválido. Use 2 a 4 letras ou números (ex.: PN, MP).";
  }
  return null;
}
