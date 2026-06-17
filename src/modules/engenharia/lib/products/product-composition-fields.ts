import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { resolveCompositionEnabled } from "@/modules/engenharia/lib/products/product-bom-eligibility";
import { prefixCodeFromJoin } from "@/modules/engenharia/lib/products/product-lifecycle";

type Admin = SupabaseClient<Database>;

export const COMPOSITION_ENABLED_MIGRATION_HINT =
  "Aplique a migration supabase/migrations/20261003100000_products_composition_enabled.sql no Supabase (SQL Editor ou supabase db push).";

export function isMissingCompositionEnabledColumn(
  error: { message?: string } | null
): boolean {
  const msg = error?.message ?? "";
  return (
    msg.includes("composition_enabled") &&
    (msg.includes("does not exist") || msg.includes("Could not find"))
  );
}

export type ProductCompositionFields = {
  id: string;
  composition_enabled: boolean;
  has_composition: boolean;
  prefix_code: string | null;
};

/** Carrega flags de composição com fallback quando a coluna ainda não existe no Supabase. */
export async function loadProductCompositionFields(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<{ data: ProductCompositionFields | null; error: string | null }> {
  const withColumn = await admin
    .from("products")
    .select(
      "id, composition_enabled, has_composition, prefix:product_prefixes!products_prefix_id_fkey(code)"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!withColumn.error && withColumn.data) {
    const prefixCode = prefixCodeFromJoin(
      withColumn.data.prefix as { code?: string } | { code?: string }[] | null
    );
    return {
      data: {
        id: withColumn.data.id,
        composition_enabled: resolveCompositionEnabled(
          withColumn.data.composition_enabled,
          withColumn.data.has_composition
        ),
        has_composition: withColumn.data.has_composition === true,
        prefix_code: prefixCode,
      },
      error: null,
    };
  }

  if (!isMissingCompositionEnabledColumn(withColumn.error)) {
    return {
      data: null,
      error: withColumn.error?.message ?? "Erro ao carregar produto",
    };
  }

  const legacy = await admin
    .from("products")
    .select(
      "id, has_composition, prefix:product_prefixes!products_prefix_id_fkey(code)"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (legacy.error) {
    return { data: null, error: legacy.error.message };
  }
  if (!legacy.data) {
    return { data: null, error: null };
  }

  const { count } = await admin
    .from("product_components")
    .select("*", { count: "exact", head: true })
    .eq("parent_product_id", productId)
    .eq("tenant_id", tenantId);

  const hasLines = (count ?? 0) > 0;
  const hasComposition =
    legacy.data.has_composition === true || hasLines;
  const prefixCode = prefixCodeFromJoin(
    legacy.data.prefix as { code?: string } | { code?: string }[] | null
  );

  return {
    data: {
      id: legacy.data.id,
      composition_enabled: resolveCompositionEnabled(undefined, hasComposition),
      has_composition: hasComposition,
      prefix_code: prefixCode,
    },
    error: null,
  };
}
