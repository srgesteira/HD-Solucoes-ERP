import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  buildPurchaseOrderUniversalSearchOrFilter,
  resolvePurchaseOrderIdsFromUniversalSearch,
} from "@/modules/core/lib/universal-search-query";
import {
  matchesUniversalSearchRow,
  parseUniversalSearch,
} from "@/shared/utils/universal-search";

type Admin = SupabaseClient<Database>;

export type PurchaseOrderBoardRow = {
  id: string;
  po_number: string;
  supplier_name: string;
  order_date: string;
  expected_delivery: string | null;
  total_value: number;
  status: string;
  /** Códigos/nomes de produtos do pedido (para busca universal no cliente). */
  product_hints?: string[];
};

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  return String(v).slice(0, 10);
}

export type OrderSituation = "pending" | "on_time" | "late";

export function computeOrderSituation(
  status: string,
  expectedDelivery: string | null
): OrderSituation {
  const today = new Date().toISOString().slice(0, 10);
  const st = status.toLowerCase();
  if (st === "received" || st === "cancelled") return "on_time";
  const exp = dateOnly(expectedDelivery);
  if (!exp) return "pending";
  if (exp < today) return "late";
  if (st === "draft" || st === "confirmed" || st === "sent" || st === "partial") {
    return "pending";
  }
  return "on_time";
}

const OPEN_STATUSES = ["draft", "sent", "confirmed", "partial"];
const FINISHED_STATUSES = ["received"];

export type PurchaseBoardBucket = "all" | "open" | "finished";

export async function fetchPurchaseOrdersBoard(
  admin: Admin,
  tenantId: string,
  bucket: PurchaseBoardBucket,
  rawSearch = ""
): Promise<PurchaseOrderBoardRow[]> {
  const searchHint = parseUniversalSearch(rawSearch);
  const productOrderIds = searchHint.text
    ? await resolvePurchaseOrderIdsFromUniversalSearch(admin, tenantId, searchHint.text)
    : [];

  let query = admin
    .from("purchase_orders")
    .select(
      `
      id,
      po_number,
      order_date,
      expected_delivery,
      status,
      total,
      supplier:suppliers!purchase_orders_supplier_id_fkey(name, legal_name),
      items:purchase_order_items(
        product:products!purchase_order_items_product_id_fkey(code, technical_code, name)
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .order("order_date", { ascending: false });

  if (bucket === "open") {
    query = query.in("status", OPEN_STATUSES);
  } else if (bucket === "finished") {
    query = query.in("status", FINISHED_STATUSES);
  }

  const orFilter = buildPurchaseOrderUniversalSearchOrFilter(
    searchHint.text,
    productOrderIds
  );
  if (orFilter) {
    query = query.or(orFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const sup = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
    const supplierName =
      sup?.name?.trim() || sup?.legal_name?.trim() || "—";

    const productHints: string[] = [];
    const items = Array.isArray(row.items) ? row.items : [];
    for (const item of items) {
      const prod = Array.isArray(item.product) ? item.product[0] : item.product;
      if (prod?.code) productHints.push(String(prod.code));
      if (prod?.technical_code) productHints.push(String(prod.technical_code));
      if (prod?.name) productHints.push(String(prod.name));
    }

    return {
      id: row.id,
      po_number: row.po_number,
      supplier_name: supplierName,
      order_date: String(row.order_date).slice(0, 10),
      expected_delivery: dateOnly(row.expected_delivery),
      total_value: Number(row.total ?? 0),
      status: row.status,
      product_hints: productHints,
    };
  });

  if (!searchHint.text) return rows;

  return rows.filter((row) =>
    matchesUniversalSearchRow(
      searchHint,
      [
        row.po_number,
        row.supplier_name,
        row.order_date,
        row.expected_delivery,
        row.status,
        row.total_value,
      ],
      row.product_hints ?? []
    )
  );
}
