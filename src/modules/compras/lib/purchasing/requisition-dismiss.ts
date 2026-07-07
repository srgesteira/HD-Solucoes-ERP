import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export const REQUISITION_STATUS_DISMISSED = "dismissed" as const;

export type PurchaseNeedTrace = {
  productId: string;
  salesOrderItemId?: string | null;
  productionOrderItemId?: string | null;
};

/**
 * Necessidade dispensada manualmente (compra por fora).
 * Chave: product_id + linha de rastreio (sales_order_item_id OU production_order_item_id).
 * Não é global por produto.
 */
export async function findDismissedRequisitionForNeed(
  admin: Admin,
  tenantId: string,
  trace: PurchaseNeedTrace
): Promise<{ id: string } | null> {
  const salesOrderItemId = trace.salesOrderItemId?.trim() || null;
  const productionOrderItemId = trace.productionOrderItemId?.trim() || null;
  if (!salesOrderItemId && !productionOrderItemId) return null;

  let query = admin
    .from("purchase_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("product_id", trace.productId)
    .eq("status", REQUISITION_STATUS_DISMISSED)
    .is("purchase_order_id", null);

  if (salesOrderItemId) {
    query = query.eq("sales_order_item_id", salesOrderItemId);
  } else {
    query = query.eq("production_order_item_id", productionOrderItemId!);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? { id: data.id } : null;
}

/** Soft-dismiss: marca requisições draft órfãs como atendidas por fora. */
export async function dismissPurchaseRequisitions(
  admin: Admin,
  tenantId: string,
  requisitionIds: string[]
): Promise<{ dismissed: number }> {
  const ids = [...new Set(requisitionIds.filter(Boolean))];
  if (!ids.length) return { dismissed: 0 };

  const { data, error } = await admin
    .from("purchase_order_items")
    .update({ status: REQUISITION_STATUS_DISMISSED })
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("status", "draft")
    .is("purchase_order_id", null)
    .in("id", ids)
    .select("id");

  if (error) throw new Error(error.message);
  return { dismissed: (data ?? []).length };
}
