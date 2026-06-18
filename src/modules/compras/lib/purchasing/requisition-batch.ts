import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type { PurchaseRequisitionRow } from "@/modules/compras/lib/purchasing-requisitions";

type Admin = SupabaseClient<Database>;

export const SAME_SUPPLIER_ERROR =
  "Selecione apenas requisições com o mesmo fornecedor sugerido.";
export const MISSING_SUPPLIER_ERROR =
  "Defina o fornecedor sugerido em todas as requisições seleccionadas.";

export type SameSupplierValidation =
  | { ok: true; supplierId: string; supplierName: string }
  | { ok: false; message: string };

export type AggregatedRequisitionLine = {
  key: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  description: string;
  unit: string;
  total_quantity: number;
  source_count: number;
};

/** Pré-visualização de linhas do PC após somar produtos iguais. */
export function aggregateRequisitionsForPreview(
  rows: Pick<
    PurchaseRequisitionRow,
    | "id"
    | "product_id"
    | "product_code"
    | "product_name"
    | "description"
    | "quantity"
    | "unit"
  >[]
): AggregatedRequisitionLine[] {
  const map = new Map<string, AggregatedRequisitionLine>();

  for (const row of rows) {
    const unit = (row.unit || "UN").trim().toUpperCase();
    const key = row.product_id
      ? `p:${row.product_id}:${unit}`
      : `d:${row.description.trim().toLowerCase()}:${unit}`;

    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        key,
        product_id: row.product_id,
        product_code: row.product_code,
        product_name: row.product_name,
        description: row.description,
        unit: row.unit,
        total_quantity: Number(row.quantity ?? 0),
        source_count: 1,
      });
      continue;
    }
    cur.total_quantity += Number(row.quantity ?? 0);
    cur.source_count += 1;
  }

  return [...map.values()];
}

export function validateSameSuggestedSupplier(
  rows: Pick<PurchaseRequisitionRow, "suggested_supplier_id" | "suggested_supplier_name">[]
): SameSupplierValidation {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.suggested_supplier_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (ids.length === 0) {
    return { ok: false, message: MISSING_SUPPLIER_ERROR };
  }
  if (ids.length > 1) {
    return { ok: false, message: SAME_SUPPLIER_ERROR };
  }
  const supplierId = ids[0]!;
  const supplierName =
    rows.find((r) => r.suggested_supplier_id === supplierId)
      ?.suggested_supplier_name?.trim() || "Fornecedor";
  return { ok: true, supplierId, supplierName };
}

export async function assertRequisitionsSameSuggestedSupplier(
  admin: Admin,
  tenantId: string,
  requisitionIds: string[]
): Promise<string> {
  const { data, error } = await admin
    .from("purchase_order_items")
    .select("id, suggested_supplier_id")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("id", requisitionIds);

  if (error) throw new Error(error.message);
  if ((data ?? []).length !== requisitionIds.length) {
    throw new Error("Uma ou mais requisições não foram encontradas.");
  }

  const ids = [
    ...new Set(
      (data ?? [])
        .map((r) => r.suggested_supplier_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (ids.length === 0) throw new Error(MISSING_SUPPLIER_ERROR);
  if (ids.length > 1) throw new Error(SAME_SUPPLIER_ERROR);
  return ids[0]!;
}
