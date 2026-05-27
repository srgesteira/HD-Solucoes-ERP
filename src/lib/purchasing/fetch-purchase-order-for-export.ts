import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { computePurchaseOrderTotal, num } from "@/lib/purchasing/purchase-order-totals";
import { fmtPoBRL, fmtPoDate } from "@/lib/purchasing/purchase-order-display";

type Admin = SupabaseClient<Database>;

const ORDER_EXPORT_SELECT = `
  *,
  supplier:suppliers(id, name, legal_name, email, document, code),
  items:purchase_order_items(
    id,
    description,
    quantity,
    unit,
    unit_price,
    total_price,
    product:products!purchase_order_items_product_id_fkey(code, technical_code, name)
  )
`.trim();

export type PurchaseOrderExportData = {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  notes: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total_icms: number;
  total_ipi: number;
  freight_cost: number;
  insurance_cost: number;
  other_costs: number;
  total_tax_non_creditable: number;
  total: number;
  supplier_name: string;
  supplier_email: string | null;
  items: {
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }[];
};

function supplierDisplayName(s: {
  legal_name?: string | null;
  name?: string | null;
} | null): string {
  if (!s) return "—";
  return (s.legal_name?.trim() || s.name?.trim() || "—") as string;
}

export async function fetchPurchaseOrderForExport(
  admin: Admin,
  tenantId: string,
  orderId: string
): Promise<PurchaseOrderExportData | null> {
  const { data, error } = await admin
    .from("purchase_orders")
    .select(ORDER_EXPORT_SELECT)
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  // PostgREST embed com select dinâmico — tipagem manual
  const row = data as unknown as {
    id: string;
    po_number: string;
    order_date: string;
    expected_delivery: string | null;
    status: string;
    notes: string | null;
    subtotal: number | null;
    discount: number | null;
    tax: number | null;
    total_icms: number | null;
    total_ipi: number | null;
    freight_cost: number | null;
    insurance_cost: number | null;
    other_costs: number | null;
    total_tax_non_creditable: number | null;
    total: number | null;
    supplier:
      | {
          id: string;
          name: string | null;
          legal_name: string | null;
          email: string | null;
        }
      | {
          id: string;
          name: string | null;
          legal_name: string | null;
          email: string | null;
        }[]
      | null;
    items: {
      description: string;
      quantity: number;
      unit: string | null;
      unit_price: number;
      total_price: number | null;
      product:
        | { code: string | null; technical_code: string | null; name: string | null }
        | { code: string | null; technical_code: string | null; name: string | null }[]
        | null;
    }[] | null;
  };

  const supplier = Array.isArray(row.supplier)
    ? row.supplier[0]
    : row.supplier;

  const rawItems = row.items ?? [];
  const items = (Array.isArray(rawItems) ? rawItems : []).map((row) => {
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    const code = product?.technical_code?.trim() || product?.code?.trim();
    const name = product?.name?.trim() || row.description?.trim() || "—";
    const description = code ? `${code} — ${name}` : name;
    const qty = Number(row.quantity ?? 0);
    const unitPrice = Number(row.unit_price ?? 0);
    const totalPrice =
      row.total_price != null
        ? Number(row.total_price)
        : Math.round(qty * unitPrice * 100) / 100;
    return {
      description,
      quantity: qty,
      unit: row.unit ?? "UN",
      unit_price: unitPrice,
      total_price: totalPrice,
    };
  });

  const subtotal = num(row.subtotal);
  const discount = num(row.discount);
  const tax = num(row.tax);
  const total_icms = num(row.total_icms);
  const total_ipi = num(row.total_ipi);
  const freight_cost = num(row.freight_cost);
  const insurance_cost = num(row.insurance_cost);
  const other_costs = num(row.other_costs);
  const total_tax_non_creditable = num(row.total_tax_non_creditable);
  const total =
    row.total != null
      ? num(row.total)
      : computePurchaseOrderTotal({
          subtotal,
          discount,
          tax,
          total_icms,
          total_ipi,
          freight_cost,
          insurance_cost,
          other_costs,
          total_tax_non_creditable,
        });

  return {
    id: row.id,
    po_number: row.po_number,
    order_date: row.order_date,
    expected_delivery: row.expected_delivery,
    status: row.status,
    notes: row.notes,
    subtotal,
    discount,
    tax,
    total_icms,
    total_ipi,
    freight_cost,
    insurance_cost,
    other_costs,
    total_tax_non_creditable,
    total,
    supplier_name: supplierDisplayName(supplier),
    supplier_email: supplier?.email?.trim() || null,
    items,
  };
}

export { fmtPoBRL, fmtPoDate };
