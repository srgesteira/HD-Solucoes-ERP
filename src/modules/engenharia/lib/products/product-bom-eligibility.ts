import {
  COMPLETE_CLASSIFICATION_SUFFIXES,
  isCompleteClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";

const BOM_PARENT_PREFIX_CODES = [
  ...COMPLETE_CLASSIFICATION_SUFFIXES,
  "SE",
] as const;

export type BomParentPrefixCode = (typeof BOM_PARENT_PREFIX_CODES)[number];

/** Produtos fabricados que podem ser pai de uma BOM (receita própria). */
export function canProductHaveBom(
  prefixCode: string | null | undefined
): boolean {
  const code = String(prefixCode ?? "").trim();
  if (!code) return false;
  return (BOM_PARENT_PREFIX_CODES as readonly string[]).includes(code);
}

export function bomEligibilityMessage(prefixCode: string | null | undefined): string {
  const code = String(prefixCode ?? "").trim();
  if (canProductHaveBom(code)) return "";
  if (code === "MP") {
    return "Matérias-primas não têm composição — são folhas de compra.";
  }
  if (code === "MO") {
    return "Produtos de mão-de-obra entram como linhas na composição de outros produtos, não como receita própria.";
  }
  if (code === "EB" || code === "MC" || code === "RV") {
    return "Este tipo de produto é comprado/revendido e não possui receita de fabricação.";
  }
  return "A composição está disponível para acabados (HD1–HD3, AC) e semi-elaborados (SE).";
}

export function isSemiFinishedPrefix(
  prefixCode: string | null | undefined
): boolean {
  return String(prefixCode ?? "").trim() === "SE";
}

/** SE com receita (BOM): custo vem da composição, não manual. */
export function seUsesBomCalculatedCost(
  prefixCode: string | null | undefined,
  hasComposition: boolean
): boolean {
  return isSemiFinishedPrefix(prefixCode) && hasComposition;
}

export { isCompleteClassificationSuffix };
