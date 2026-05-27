import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";

export const dynamic = "force-dynamic";

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  return String(v).slice(0, 10);
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const tab = request.nextUrl.searchParams.get("tab") ?? "orders";
  const admin = createSupabaseAdminClient();

  if (tab === "requisitions") {
    const { data, error } = await admin
      .from("purchase_order_items")
      .select(
        `id, quantity, status, need_date, follow_up_date, expected_delivery_date,
         product:products!purchase_order_items_product_id_fkey(id, name, technical_code, preferred_supplier_id),
         sales_order_item:sales_order_items!purchase_order_items_sales_order_item_id_fkey(
           line_number,
           sales_order:sales_orders!sales_order_items_sales_order_id_fkey(order_number)
         )`
      )
      .eq("tenant_id", tenantId)
      .is("purchase_order_id", null)
      .eq("status", "draft")
      .not("sales_order_item_id", "is", null)
      .order("need_date", { ascending: true, nullsFirst: false });

    if (error) return apiError(error.message, 400);

    const rows = (data ?? []).map((row) => {
      const prod = Array.isArray(row.product) ? row.product[0] : row.product;
      const soi = Array.isArray(row.sales_order_item)
        ? row.sales_order_item[0]
        : row.sales_order_item;
      const so = soi?.sales_order
        ? Array.isArray(soi.sales_order)
          ? soi.sales_order[0]
          : soi.sales_order
        : null;
      return {
        id: row.id,
        product_name: prod?.name ?? "—",
        product_code: prod?.technical_code ?? null,
        quantity: Number(row.quantity ?? 0),
        need_date:
          dateOnly(row.need_date) ??
          dateOnly(row.follow_up_date) ??
          dateOnly(row.expected_delivery_date),
        status: row.status,
        order_number: so?.order_number ?? null,
        line_number: soi?.line_number ?? null,
        preferred_supplier_id: prod?.preferred_supplier_id ?? null,
      };
    });

    return apiOk({ rows });
  }

  const { data, error } = await admin
    .from("purchase_order_items")
    .select(
      `id, quantity, status, need_date, expected_delivery_date, actual_delivery_date,
       description,
       product:products!purchase_order_items_product_id_fkey(name, technical_code),
       purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(
         id, po_number, order_date, expected_delivery, status,
         supplier:suppliers!purchase_orders_supplier_id_fkey(name)
       )`
    )
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return apiError(error.message, 400);

  const rows = (data ?? []).map((row) => {
    const po = Array.isArray(row.purchase_order)
      ? row.purchase_order[0]
      : row.purchase_order;
    const prod = Array.isArray(row.product) ? row.product[0] : row.product;
    const sup = po?.supplier
      ? Array.isArray(po.supplier)
        ? po.supplier[0]
        : po.supplier
      : null;
    return {
      id: row.id,
      po_id: po?.id ?? null,
      po_number: po?.po_number ?? "—",
      supplier_name: sup?.name ?? "—",
      product_name: prod?.name ?? row.description ?? "—",
      quantity: Number(row.quantity ?? 0),
      order_date: dateOnly(po?.order_date),
      expected_delivery_date:
        dateOnly(row.expected_delivery_date) ??
        dateOnly(po?.expected_delivery),
      actual_delivery_date: dateOnly(row.actual_delivery_date),
      status: po?.status ?? row.status,
    };
  });

  return apiOk({ rows });
}
