import { COMPLETE_CLASSIFICATION_SUFFIXES } from "@/lib/products/prefix-classification";

/** Administradores veem todos os prefixos; demais utilizadores só acabados (HD/AC). */
export function finishedProductPrefixCodes(): readonly string[] {
  return COMPLETE_CLASSIFICATION_SUFFIXES;
}

export function canViewProductPrefixCode(
  prefixCode: string,
  isAdmin: boolean
): boolean {
  const code = prefixCode.trim().toUpperCase();
  if (!code || code === "ALL") return true;
  if (isAdmin) return true;
  return (COMPLETE_CLASSIFICATION_SUFFIXES as readonly string[]).includes(code);
}

export function filterAllowedPrefixCodes(
  codes: string[],
  isAdmin: boolean
): string[] {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (isAdmin) return unique.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return unique
    .filter((c) =>
      (COMPLETE_CLASSIFICATION_SUFFIXES as readonly string[]).includes(c)
    )
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
