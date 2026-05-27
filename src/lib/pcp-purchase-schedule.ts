import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

export type PcpPurchaseScheduleRow = {
  id: string;
  purchase_order_id: string;
  po_number: string;
  po_status: string;
  supplier_id: string | null;
  supplier_name: string | null;
  product_id: string | null;
  product_code: string | null;
  description: string;
  quantity: number;
  unit: string;
  sales_order_id: string | null;
  sales_order_number: string | null;
  sales_order_item_id: string | null;
  expected_delivery: string | null;
  follow_up_date: string | null;
  received_quantity: number;
};

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  return String(v).slice(0, 10);
}

export async function fetchPcpPurchaseSchedule(
  admin: Admin,
  tenantId: string
): Promise<PcpPurchaseScheduleRow[]> {
  const { data: poiRows, error } = await admin
    .from("purchase_order_items")
    .select(
      `
      id,
      purchase_order_id,
      product_id,
      description,
      quantity,
      unit,
      received_quantity,
      sales_order_item_id,
      follow_up_date,
      purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(
        id,
        po_number,
        status,
        supplier_id,
        expected_delivery,
        supplier:suppliers(id, name, legal_name)
      ),
      product:products!purchase_order_items_product_id_fkey(technical_code),
      sales_order_item:sales_order_items!purchase_order_items_sales_order_item_id_fkey(
        id,
        sales_order_id,
        pcp_deadline,
        sales_order:sales_orders!sales_order_items_sales_order_id_fkey(
          id,
          order_number,
          expected_delivery
        )
      )
    `
    )
    .eq("tenant_id", tenantId)
    .not("sales_order_item_id", "is", null)
    .not("purchase_order_id", "is", null)
    .order("follow_up_date", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const rows: PcpPurchaseScheduleRow[] = [];

  for (const row of poiRows ?? []) {
    const po = Array.isArray(row.purchase_order)
      ? row.purchase_order[0]
      : row.purchase_order;
    if (!po) continue;

    const soi = Array.isArray(row.sales_order_item)
      ? row.sales_order_item[0]
      : row.sales_order_item;
    const so = soi?.sales_order
      ? Array.isArray(soi.sales_order)
        ? soi.sales_order[0]
        : soi.sales_order
      : null;

    const supplier = po.supplier
      ? Array.isArray(po.supplier)
        ? po.supplier[0]
        : po.supplier
      : null;

    const product = row.product
      ? Array.isArray(row.product)
        ? row.product[0]
        : row.product
      : null;

    const expected =
      dateOnly(po.expected_delivery) ??
      dateOnly(soi?.pcp_deadline) ??
      dateOnly(so?.expected_delivery);

    rows.push({
      id: row.id,
      purchase_order_id: row.purchase_order_id!,
      po_number: po.po_number,
      po_status: po.status,
      supplier_id: po.supplier_id,
      supplier_name:
        supplier?.legal_name ?? supplier?.name ?? null,
      product_id: row.product_id,
      product_code: product?.technical_code ?? null,
      description: row.description,
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "UN",
      sales_order_id: so?.id ?? null,
      sales_order_number: so?.order_number ?? null,
      sales_order_item_id: row.sales_order_item_id,
      expected_delivery: expected,
      follow_up_date: dateOnly(row.follow_up_date),
      received_quantity: Number(row.received_quantity ?? 0),
    });
  }

  return rows.sort((a, b) => {
    const fa = a.follow_up_date ?? "9999-12-31";
    const fb = b.follow_up_date ?? "9999-12-31";
    if (fa !== fb) return fa.localeCompare(fb);
    return (a.po_number ?? "").localeCompare(b.po_number ?? "");
  });
}
