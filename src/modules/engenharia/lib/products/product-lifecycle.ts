import {
  isCompleteClassificationSuffix,
  isMoClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";
import {
  ENGINEERING_STATUS_PENDING,
  ENGINEERING_STATUS_RELEASED,
} from "@/modules/engenharia/lib/products/engineering-workflow";

/** Estados legíveis derivados dos flags existentes (não persistido). */
export const PRODUCT_LIFECYCLE_VALUES = [
  "mask",
  "engineering",
  "released",
  "resale",
] as const;

export type ProductLifecycle = (typeof PRODUCT_LIFECYCLE_VALUES)[number];

export type ProductLifecycleInput = {
  product_nature?: string | null;
  has_composition?: boolean | null;
  released_for_sale?: boolean | null;
  engineering_workflow_status?: string | null;
  prefix_code?: string | null;
};

export const PRODUCT_LIFECYCLE_LABELS: Record<ProductLifecycle, string> = {
  mask: "Máscara",
  engineering: "Eng. pendente",
  released: "Liberado",
  resale: "Revenda",
};

export const PRODUCT_LIFECYCLE_BADGE_CLASS: Record<ProductLifecycle, string> = {
  mask: "bg-violet-50 text-violet-900 ring-1 ring-violet-200",
  engineering: "bg-amber-50 text-amber-950 ring-1 ring-amber-300",
  released: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200",
  resale: "bg-sky-50 text-sky-900 ring-1 ring-sky-200",
};

type PrefixJoin =
  | { code?: string | null }
  | { code?: string | null }[]
  | null
  | undefined;

/** Extrai código do prefixo a partir do join Supabase (`prefix` ou `product_prefixes`). */
export function prefixCodeFromJoin(prefix: PrefixJoin): string | null {
  if (!prefix) return null;
  if (Array.isArray(prefix)) return prefix[0]?.code?.trim() || null;
  return prefix.code?.trim() || null;
}

/**
 * Deriva o lifecycle legível a partir dos flags atuais.
 * MP/EB/MC (compra) → null (fora dos 4 estados comerciais/fabricação).
 */
export function deriveProductLifecycle(
  input: ProductLifecycleInput
): ProductLifecycle | null {
  const prefix = (input.prefix_code ?? "").trim().toUpperCase();
  const nature = (input.product_nature ?? "").trim().toUpperCase();
  const workflow = (input.engineering_workflow_status ?? "").trim();
  const hasComposition = input.has_composition === true;
  const releasedForSale = input.released_for_sale === true;

  if (nature === "RV" || prefix === "RV" || prefix === "HD3") return "resale";

  if (isMoClassificationSuffix(prefix)) return "mask";

  if (workflow === ENGINEERING_STATUS_PENDING) return "engineering";

  const isSemiFinished = prefix === "SE" || nature === "SE";
  if (isSemiFinished) {
    if (!hasComposition) return "engineering";
    return "released";
  }

  const isFinishedProduct =
    isCompleteClassificationSuffix(prefix) || nature === "AC";
  if (isFinishedProduct) {
    if (releasedForSale || workflow === ENGINEERING_STATUS_RELEASED) {
      return "released";
    }
    return "engineering";
  }

  return null;
}

/** Produto ainda em construção / aguardando engenharia (não liberado). */
export function isProductEngineeringPending(
  input: ProductLifecycleInput
): boolean {
  return deriveProductLifecycle(input) === "engineering";
}
