import type { Database } from "@/modules/core/types/database";
import {
  isCompleteClassificationSuffix,
  isMoClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";

export type ProductType = Database["public"]["Tables"]["products"]["Row"]["type"];

/** Define `products.type` a partir do código do prefixo (sufixo). */
export function productTypeFromPrefixCode(
  prefixCode: string | null | undefined
): ProductType {
  const code = String(prefixCode ?? "").trim();
  if (isCompleteClassificationSuffix(code)) return "finished";
  if (code === "MP") return "raw";
  if (isMoClassificationSuffix(code)) return "component";
  if (code === "SE" || code === "EB" || code === "MC" || code === "RV") {
    return "component";
  }
  return "component";
}
