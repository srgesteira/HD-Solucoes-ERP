import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  escapeIlike,
  extractIsoDateFromSearch,
  normalizeUniversalSearch,
} from "@/shared/utils/universal-search";

type Admin = SupabaseClient<Database>;

async function findProductIdsBySearch(
  admin: Admin,
  tenantId: string,
  safe: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("products")
    .select("id")
    .eq("tenant_id", tenantId)
    .or(
      `code.ilike.${safe},technical_code.ilike.${safe},name.ilike.${safe},description.ilike.${safe}`
    );

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}

async function findQuoteIdsByProductSearch(
  admin: Admin,
  tenantId: string,
  productIds: string[]
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await admin
    .from("quote_items")
    .select("quote_id")
    .eq("tenant_id", tenantId)
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => row.quote_id))];
}

async function findSalesOrderIdsByProductSearch(
  admin: Admin,
  tenantId: string,
  productIds: string[]
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await admin
    .from("sales_order_items")
    .select("sales_order_id")
    .eq("tenant_id", tenantId)
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => row.sales_order_id))];
}

async function findPurchaseOrderIdsByProductSearch(
  admin: Admin,
  tenantId: string,
  productIds: string[]
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await admin
    .from("purchase_order_items")
    .select("purchase_order_id")
    .eq("tenant_id", tenantId)
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.purchase_order_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

function buildOrFilter(parts: string[]): string | null {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return null;
  return filtered.join(",");
}

/** Resolve IDs de orçamentos que batem com busca em itens/produtos. */
export async function resolveQuoteIdsFromUniversalSearch(
  admin: Admin,
  tenantId: string,
  rawSearch: string
): Promise<string[]> {
  const text = normalizeUniversalSearch(rawSearch);
  if (!text) return [];
  const safe = `%${escapeIlike(text)}%`;
  const productIds = await findProductIdsBySearch(admin, tenantId, safe);
  return findQuoteIdsByProductSearch(admin, tenantId, productIds);
}

/** Resolve IDs de pedidos de venda que batem com busca em itens/produtos. */
export async function resolveSalesOrderIdsFromUniversalSearch(
  admin: Admin,
  tenantId: string,
  rawSearch: string
): Promise<string[]> {
  const text = normalizeUniversalSearch(rawSearch);
  if (!text) return [];
  const safe = `%${escapeIlike(text)}%`;
  const productIds = await findProductIdsBySearch(admin, tenantId, safe);
  return findSalesOrderIdsByProductSearch(admin, tenantId, productIds);
}

/** Resolve IDs de pedidos de compra que batem com busca em itens/produtos. */
export async function resolvePurchaseOrderIdsFromUniversalSearch(
  admin: Admin,
  tenantId: string,
  rawSearch: string
): Promise<string[]> {
  const text = normalizeUniversalSearch(rawSearch);
  if (!text) return [];
  const safe = `%${escapeIlike(text)}%`;
  const productIds = await findProductIdsBySearch(admin, tenantId, safe);
  return findPurchaseOrderIdsByProductSearch(admin, tenantId, productIds);
}

/** Monta filtro `.or()` para cabeçalho de orçamento + data + IDs de produto. */
export function buildQuoteUniversalSearchOrFilter(
  rawSearch: string,
  quoteIdsFromProducts: string[]
): string | null {
  const text = normalizeUniversalSearch(rawSearch);
  if (!text) return null;

  const safe = `%${escapeIlike(text)}%`;
  const parts: string[] = [
    `quote_number.ilike.${safe}`,
    `client_name.ilike.${safe}`,
    `client_email.ilike.${safe}`,
  ];

  const isoDate = extractIsoDateFromSearch(text);
  if (isoDate) {
    parts.push(`quote_date.eq.${isoDate}`);
    parts.push(`valid_until.eq.${isoDate}`);
  }

  if (quoteIdsFromProducts.length > 0) {
    parts.push(`id.in.(${quoteIdsFromProducts.join(",")})`);
  }

  return buildOrFilter(parts);
}

/** Monta filtro `.or()` para cabeçalho de pedido de venda + data + IDs de produto. */
export function buildSalesOrderUniversalSearchOrFilter(
  rawSearch: string,
  orderIdsFromProducts: string[]
): string | null {
  const text = normalizeUniversalSearch(rawSearch);
  if (!text) return null;

  const safe = `%${escapeIlike(text)}%`;
  const parts: string[] = [
    `order_number.ilike.${safe}`,
    `client_name.ilike.${safe}`,
  ];

  const isoDate = extractIsoDateFromSearch(text);
  if (isoDate) {
    parts.push(`order_date.eq.${isoDate}`);
    parts.push(`expected_delivery.eq.${isoDate}`);
  }

  if (orderIdsFromProducts.length > 0) {
    parts.push(`id.in.(${orderIdsFromProducts.join(",")})`);
  }

  return buildOrFilter(parts);
}

/** Monta filtro `.or()` para cabeçalho de pedido de compra + data + IDs de produto. */
export function buildPurchaseOrderUniversalSearchOrFilter(
  rawSearch: string,
  orderIdsFromProducts: string[],
  supplierNames: string[] = []
): string | null {
  const text = normalizeUniversalSearch(rawSearch);
  if (!text) return null;

  const safe = `%${escapeIlike(text)}%`;
  const parts: string[] = [`po_number.ilike.${safe}`];

  const isoDate = extractIsoDateFromSearch(text);
  if (isoDate) {
    parts.push(`order_date.eq.${isoDate}`);
    parts.push(`expected_delivery.eq.${isoDate}`);
  }

  if (orderIdsFromProducts.length > 0) {
    parts.push(`id.in.(${orderIdsFromProducts.join(",")})`);
  }

  for (const name of supplierNames) {
    if (name.toLowerCase().includes(text.toLowerCase())) {
      // handled client-side for supplier join; keep po_number/date/product match server-side
      break;
    }
  }

  return buildOrFilter(parts);
}

export { extractIsoDateFromSearch, normalizeUniversalSearch };
