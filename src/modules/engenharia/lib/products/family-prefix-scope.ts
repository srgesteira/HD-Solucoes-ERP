import { isCompleteClassificationSuffix } from "@/modules/engenharia/lib/products/prefix-classification";

/** Famílias com prefix_id NULL são do grupo HD1/HD2/HD3/AC. */
export function familyCatalogUsesSharedCompletePrefix(
  prefixCode: string | null | undefined
): boolean {
  return isCompleteClassificationSuffix(prefixCode);
}
