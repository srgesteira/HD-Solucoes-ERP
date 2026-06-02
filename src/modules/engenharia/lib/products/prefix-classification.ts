/** Produtos acabados (faturamento / produção interna): classificação completa. */
export const COMPLETE_CLASSIFICATION_SUFFIXES = [
  "HD1",
  "HD2",
  "HD3",
  "AC",
] as const;

/** Materiais de compra e mão-de-obra: só material + acabamento. */
export const SIMPLIFIED_CLASSIFICATION_SUFFIXES = [
  "MP",
  "SE",
  "EB",
  "MC",
  "RV",
  "MO",
] as const;

export type CompleteClassificationSuffix =
  (typeof COMPLETE_CLASSIFICATION_SUFFIXES)[number];
export type SimplifiedClassificationSuffix =
  (typeof SIMPLIFIED_CLASSIFICATION_SUFFIXES)[number];

export function isCompleteClassificationSuffix(
  code: string | null | undefined
): code is CompleteClassificationSuffix {
  return (COMPLETE_CLASSIFICATION_SUFFIXES as readonly string[]).includes(
    String(code ?? "").trim()
  );
}

export function isSimplifiedClassificationSuffix(
  code: string | null | undefined
): boolean {
  const c = String(code ?? "").trim();
  if (!c) return false;
  return !isCompleteClassificationSuffix(c);
}

export function isMoClassificationSuffix(
  code: string | null | undefined
): boolean {
  return String(code ?? "").trim() === "MO";
}
