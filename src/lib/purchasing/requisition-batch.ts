import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { PurchaseRequisitionRow } from "@/lib/purchasing-requisitions";

type Admin = SupabaseClient<Database>;

export const SAME_SUPPLIER_ERROR =
  "Selecione apenas requisições com o mesmo fornecedor sugerido.";
export const MISSING_SUPPLIER_ERROR =
  "Defina o fornecedor sugerido em todas as requisições seleccionadas.";

export type SameSupplierValidation =
  | { ok: true; supplierId: string; supplierName: string }
  | { ok: false; message: string };

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
