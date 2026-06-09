import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { nextPurchaseOrderNumber } from "@/modules/compras/lib/purchasing/purchase-order-number";

type Admin = SupabaseClient<Database>;

export async function resolveSupplierIdForProduct(
  admin: Admin,
  tenantId: string,
  productId: string | null,
  overrideSupplierId?: string | null
): Promise<string> {
  if (overrideSupplierId) {
    const { data: ok } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", overrideSupplierId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!ok) throw new Error("Fornecedor seleccionado inválido ou inactivo.");
    return overrideSupplierId;
  }

  const { data: suppliers, error: sErr } = await admin
    .from("suppliers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(1);
  if (sErr) throw new Error(sErr.message);
  const fallback = suppliers?.[0]?.id ?? null;
  if (!fallback) {
    throw new Error("Cadastre pelo menos um fornecedor ativo para emitir o PC.");
  }

  if (!productId) return fallback;

  const { data: product } = await admin
    .from("products")
    .select("preferred_supplier_id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const prefId = product?.preferred_supplier_id;
  if (!prefId) return fallback;

  const { data: ok } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", prefId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  return ok?.id ?? fallback;
}

export type IssueBulkResult = {
  purchase_order_id: string;
  po_number: string;
  linked_count: number;
};

export async function issueRequisitionsAsPurchaseOrder(
  admin: Admin,
  tenantId: string,
  userId: string,
  requisitionIds: string[],
  options?: { supplier_id?: string | null; po_number?: string | null }
): Promise<IssueBulkResult> {
  const ids = [...new Set(requisitionIds.filter(Boolean))];
  if (!ids.length) throw new Error("Seleccione pelo menos uma requisição.");

  const { data: items, error: itemErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, product_id, description, quantity, unit, unit_price, trace_key, follow_up_date, purchase_order_id, status"
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("id", ids);

  if (itemErr) throw new Error(itemErr.message);
  if ((items ?? []).length !== ids.length) {
    throw new Error("Uma ou mais requisições não foram encontradas.");
  }

  for (const it of items ?? []) {
    if (it.purchase_order_id || it.status !== "draft") {
      throw new Error(
        "Só é possível emitir requisições em rascunho ainda não vinculadas a um PC."
      );
    }
  }

  const first = items![0]!;
  const supplierId = await resolveSupplierIdForProduct(
    admin,
    tenantId,
    first.product_id,
    options?.supplier_id
  );

  const followUps = (items ?? [])
    .map((i) => i.follow_up_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const expectedDelivery = followUps[0] ? String(followUps[0]).slice(0, 10) : null;

  const poNumber =
    options?.po_number?.trim() ||
    (await nextPurchaseOrderNumber(admin, tenantId, expectedDelivery));

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const { data: po, error: poErr } = await admin
    .from("purchase_orders")
    .insert({
      tenant_id: tenantId,
      po_number: poNumber,
      supplier_id: supplierId,
      status: "draft",
      expected_delivery: expectedDelivery,
      requested_by: profile?.id ?? null,
    })
    .select("id, po_number")
    .single();

  if (poErr) throw new Error(poErr.message);

  const { error: linkErr } = await admin
    .from("purchase_order_items")
    .update({
      purchase_order_id: po.id,
      status: "linked",
    })
    .eq("tenant_id", tenantId)
    .in("id", ids);

  if (linkErr) {
    await admin.from("purchase_orders").delete().eq("id", po.id);
    throw new Error(linkErr.message);
  }

  return {
    purchase_order_id: po.id,
    po_number: po.po_number,
    linked_count: ids.length,
  };
}
