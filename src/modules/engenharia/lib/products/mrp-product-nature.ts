import type { Database } from "@/modules/core/types/database";

export const PRODUCT_NATURE_CODES = [
  "MP",
  "SE",
  "EB",
  "MC",
  "RV",
  "AC",
] as const;

export type ProductNatureCode = (typeof PRODUCT_NATURE_CODES)[number];

export type MrpProductNatureMeta = {
  product_nature: string | null;
  has_composition: boolean;
  type: Database["public"]["Tables"]["products"]["Row"]["type"];
};

/** Na explosão da BOM: continuar para componentes ou parar neste produto (folha de compra). */
export function mrShouldExpandBomInExplosion(meta: MrpProductNatureMeta): boolean {
  const n = meta.product_nature;
  if (n === "MP" || n === "EB" || n === "MC" || n === "RV") return false;
  if (n === "SE" || n === "AC") return meta.has_composition === true;
  if (n == null || n === "") {
    return (
      (meta.type === "finished" || meta.type === "component") &&
      meta.has_composition === true
    );
  }
  return false;
}

/** Linha de venda: gera ordem de produção (MRP por linha) ou só compras. */
export function mrSalesLineEligibleForProductionOrder(
  meta: MrpProductNatureMeta
): boolean {
  const n = meta.product_nature;
  if (n === "AC" || n === "SE") return meta.has_composition === true;
  if (n === "MP" || n === "EB" || n === "MC" || n === "RV") return false;
  if (n == null || n === "") {
    return meta.type === "finished" && meta.has_composition === true;
  }
  return false;
}

/** Saldo futuro: AC/SE somam produção; MP/EB/MC/RV não. */
export function mrSaldoFuturoIncludesProduction(
  productNature: string | null | undefined
): boolean {
  const n = productNature?.trim() ?? "";
  return n === "AC" || n === "SE";
}

export const PRODUCT_NATURE_LABELS: Record<ProductNatureCode, string> = {
  MP: "MP — Matéria-prima",
  SE: "SE — Semi-elaborado",
  EB: "EB — Embalagem",
  MC: "MC — Material de consumo",
  RV: "RV — Revenda",
  AC: "AC — Acabado",
};

/** Deriva `product_nature` (MRP) a partir do código do prefixo/sufixo. */
export function productNatureFromPrefixCode(
  prefixCode: string
): ProductNatureCode | null {
  const code = prefixCode.trim().toUpperCase();
  if (code === "MO") return null;
  if (
    code === "MP" ||
    code === "SE" ||
    code === "EB" ||
    code === "MC" ||
    code === "RV"
  ) {
    return code;
  }
  if (code === "AC" || code === "HD1" || code === "HD2" || code === "HD3") {
    return "AC";
  }
  return null;
}
