/** Utilização fiscal da linha de produto (venda/compra). */
export type ItemUsageType = "consumo" | "materia_prima" | "revenda";

export const ITEM_USAGE_TYPE_OPTIONS: Array<{
  value: ItemUsageType;
  label: string;
}> = [
  { value: "consumo", label: "Consumo" },
  { value: "materia_prima", label: "Matéria-prima" },
  { value: "revenda", label: "Revenda" },
];

export function isItemUsageType(v: unknown): v is ItemUsageType {
  return v === "consumo" || v === "materia_prima" || v === "revenda";
}

/**
 * Sugere utilização a partir da natureza/prefixo do produto.
 * HD3/RV → revenda; MP → matéria-prima; restantes → consumo.
 */
export function suggestUsageTypeFromProductNature(
  productNature: string | null | undefined,
  prefixCode?: string | null
): ItemUsageType | null {
  const nature = (productNature ?? "").trim().toUpperCase();
  const prefix = (prefixCode ?? "").trim().toUpperCase();
  const code = nature || prefix;
  if (!code) return null;
  if (code === "RV" || code === "HD3" || code.includes("REVENDA")) {
    return "revenda";
  }
  if (code === "MP" || code.includes("MATERIA")) {
    return "materia_prima";
  }
  return "consumo";
}
