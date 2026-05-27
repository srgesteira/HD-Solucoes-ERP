import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

export const PRODUCT_HARD_DELETE_BLOCKED_MESSAGE =
  "Produto possui vínculos com vendas, compras, produção ou composições. Não é possível excluir.";

async function countByProductId(
  admin: Admin,
  table: "sales_order_items" | "purchase_order_items" | "order_items",
  productId: string,
  tenantId: string
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(`Erro ao verificar vínculos (${table}): ${error.message}`);
  }
  return count ?? 0;
}

async function countProductComponentLinks(
  admin: Admin,
  productId: string,
  tenantId: string
): Promise<number> {
  const { count, error } = await admin
    .from("product_components")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .or(
      `parent_product_id.eq.${productId},component_product_id.eq.${productId}`
    );

  if (error) {
    throw new Error(
      `Erro ao verificar vínculos (product_components): ${error.message}`
    );
  }
  return count ?? 0;
}

/** Verifica se o produto pode ser excluído fisicamente (sem referências). */
export async function assertProductCanBeHardDeleted(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<void> {
  const checks = await Promise.all([
    countByProductId(admin, "sales_order_items", productId, tenantId),
    countByProductId(admin, "purchase_order_items", productId, tenantId),
    countByProductId(admin, "order_items", productId, tenantId),
    countProductComponentLinks(admin, productId, tenantId),
  ]);

  if (checks.some((n) => n > 0)) {
    throw new Error(PRODUCT_HARD_DELETE_BLOCKED_MESSAGE);
  }
}

/** Exclusão física: histórico, linhas de composição e produto. */
export async function hardDeleteProduct(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<void> {
  await assertProductCanBeHardDeleted(admin, tenantId, productId);

  const { error: histErr } = await admin
    .from("product_price_history")
    .delete()
    .eq("product_id", productId)
    .eq("tenant_id", tenantId);

  if (histErr) {
    throw new Error(
      `Erro ao remover histórico de custos: ${histErr.message}`
    );
  }

  const { error: compErr } = await admin
    .from("product_components")
    .delete()
    .or(
      `parent_product_id.eq.${productId},component_product_id.eq.${productId}`
    )
    .eq("tenant_id", tenantId);

  if (compErr) {
    throw new Error(`Erro ao remover composição: ${compErr.message}`);
  }

  const { data: deleted, error: prodErr } = await admin
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (prodErr) {
    throw new Error(`Erro ao excluir produto: ${prodErr.message}`);
  }
  if (!deleted) {
    throw new Error("Produto não encontrado");
  }
}
