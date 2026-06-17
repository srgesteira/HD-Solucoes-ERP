import {
  COMPLETE_CLASSIFICATION_SUFFIXES,
  isCompleteClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";

/** Prefixos que podem ser pai de BOM quando composition_enabled = true (exclui HD3 revenda). */
const BOM_PARENT_PREFIX_CODES = ["HD1", "HD2", "AC", "SE"] as const;

export type BomParentPrefixCode = (typeof BOM_PARENT_PREFIX_CODES)[number];

/** HD3 (produtos revendidos) e RV — revenda, sem receita de fabricação. */
export function isResaleProductPrefix(
  prefixCode: string | null | undefined
): boolean {
  const code = String(prefixCode ?? "").trim().toUpperCase();
  return code === "HD3" || code === "RV";
}

/** HD1, HD2, AC — acabados fabricados com composição opcional. */
export function canToggleComposition(
  prefixCode: string | null | undefined
): boolean {
  const code = String(prefixCode ?? "").trim().toUpperCase();
  return code === "HD1" || code === "HD2" || code === "AC";
}

/** Produtos que podem ter linhas na BOM. */
export function canProductHaveBom(
  prefixCode: string | null | undefined,
  compositionEnabled?: boolean | null
): boolean {
  const code = String(prefixCode ?? "").trim().toUpperCase();
  if (!code || isResaleProductPrefix(code)) return false;
  if (code === "SE") return true;
  if (canToggleComposition(code)) return compositionEnabled === true;
  return false;
}

export function bomEligibilityMessage(
  prefixCode: string | null | undefined,
  compositionEnabled?: boolean | null
): string {
  const code = String(prefixCode ?? "").trim().toUpperCase();
  if (isResaleProductPrefix(code)) {
    return "Produtos de revenda (HD3 / RV) não possuem composição — o custo é manual ou vem da compra.";
  }
  if (canToggleComposition(code) && compositionEnabled !== true) {
    return "Composição desactivada. Active na secção abaixo ou use custo manual na aba Informações básicas.";
  }
  if (canProductHaveBom(code, compositionEnabled)) return "";
  if (code === "MP") {
    return "Matérias-primas não têm composição — são folhas de compra.";
  }
  if (code === "MO") {
    return "Produtos de mão-de-obra entram como linhas na composição de outros produtos, não como receita própria.";
  }
  if (code === "EB" || code === "MC") {
    return "Este tipo de produto é comprado e não possui receita de fabricação.";
  }
  return "A composição está disponível para acabados fabricados (HD1, HD2, AC) e semi-elaborados (SE).";
}

export function isSemiFinishedPrefix(
  prefixCode: string | null | undefined
): boolean {
  return String(prefixCode ?? "").trim().toUpperCase() === "SE";
}

/** SE com receita (BOM): custo vem da composição, não manual. */
export function seUsesBomCalculatedCost(
  prefixCode: string | null | undefined,
  hasComposition: boolean
): boolean {
  return isSemiFinishedPrefix(prefixCode) && hasComposition;
}

/**
 * Custo de lista editável manualmente (cadastro ou recebimento de compra).
 * Inclui revenda (HD3/RV), acabados sem composição e simplificados sem BOM.
 */
export function productUsesManualListCost(
  prefixCode: string | null | undefined,
  compositionEnabled: boolean | null | undefined,
  hasComposition: boolean | null | undefined
): boolean {
  if (isResaleProductPrefix(prefixCode)) return true;
  if (seUsesBomCalculatedCost(prefixCode, Boolean(hasComposition))) return false;
  if (canToggleComposition(prefixCode)) {
    return compositionEnabled !== true;
  }
  if (isCompleteClassificationSuffix(prefixCode)) {
    return compositionEnabled !== true;
  }
  return isSimplifiedClassificationSuffix(prefixCode);
}

/** Acabado fabricado com BOM activa: custo calculado pela composição. */
export function finishedUsesBomCalculatedCost(
  prefixCode: string | null | undefined,
  compositionEnabled: boolean | null | undefined
): boolean {
  return (
    canToggleComposition(prefixCode) && compositionEnabled === true
  );
}

export { isCompleteClassificationSuffix, COMPLETE_CLASSIFICATION_SUFFIXES };
