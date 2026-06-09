import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type {
  CompanySettingsRow,
  PurchaseOrderPrintData,
  PurchaseOrderPrintItem,
  PurchaseOrderPrintSupplier,
} from "@/modules/compras/lib/purchasing/purchase-order-display";
import { computePurchaseOrderTotal, num } from "@/modules/compras/lib/purchasing/purchase-order-totals";

type Admin = SupabaseClient<Database>;

const ORDER_PRINT_SELECT = `
  *,
  supplier:suppliers(*),
  items:purchase_order_items(
    *,
    product:products!purchase_order_items_product_id_fkey(code, technical_code, name)
  )
`.trim();

function mapSupplier(raw: Record<string, unknown> | null): PurchaseOrderPrintSupplier | null {
  if (!raw) return null;
  return {
    name: String(raw.legal_name ?? raw.name ?? "").trim() || "—",
    code: (raw.code as string | null) ?? null,
    document: (raw.document as string | null) ?? null,
    email: (raw.email as string | null) ?? null,
    phone: (raw.phone as string | null) ?? null,
    legal_name: (raw.legal_name as string | null) ?? null,
    address_street: (raw.address_street as string | null) ?? null,
    address_number: (raw.address_number as string | null) ?? null,
    address_complement: (raw.address_complement as string | null) ?? null,
    address_neighborhood: (raw.address_neighborhood as string | null) ?? null,
    address_city: (raw.address_city as string | null) ?? null,
    address_state: (raw.address_state as string | null) ?? null,
    address_zip: (raw.address_zip as string | null) ?? null,
  };
}

function mapItems(
  rawItems: Record<string, unknown>[] | null | undefined
): PurchaseOrderPrintItem[] {
  return (rawItems ?? []).map((row) => {
    const product = Array.isArray(row.product)
      ? (row.product[0] as Record<string, unknown> | undefined)
      : (row.product as Record<string, unknown> | undefined);
    const qty = Number(row.quantity ?? 0);
    const unitPrice = Number(row.unit_price ?? 0);
    const totalPrice =
      row.total_price != null
        ? Number(row.total_price)
        : Math.round(qty * unitPrice * 100) / 100;
    return {
      id: String(row.id),
      description: String(row.description ?? ""),
      quantity: qty,
      unit: String(row.unit ?? "UN"),
      unit_price: unitPrice,
      total_price: totalPrice,
      icms_rate: Number(row.icms_rate ?? 0),
      icms_value: Number(row.icms_value ?? 0),
      ipi_rate: Number(row.ipi_rate ?? 0),
      ipi_value: Number(row.ipi_value ?? 0),
      product: product
        ? {
            code: (product.code as string | null) ?? null,
            technical_code: (product.technical_code as string | null) ?? null,
            name: (product.name as string | null) ?? null,
          }
        : null,
    };
  });
}

export type PurchaseOrderPrintContext = {
  order: PurchaseOrderPrintData;
  company: CompanySettingsRow | null;
};

export async function fetchPurchaseOrderPrintContext(
  admin: Admin,
  tenantId: string,
  orderId: string
): Promise<PurchaseOrderPrintContext | null> {
  const { data, error } = await admin
    .from("purchase_orders")
    .select(ORDER_PRINT_SELECT)
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const supplierRaw = Array.isArray(row.supplier)
    ? (row.supplier[0] as Record<string, unknown> | undefined)
    : (row.supplier as Record<string, unknown> | undefined);
  const itemsRaw = row.items as Record<string, unknown>[] | null | undefined;

  const subtotal = num(row.subtotal as number | null);
  const discount = num(row.discount as number | null);
  const tax = num(row.tax as number | null);
  const total_icms = num(row.total_icms as number | null);
  const total_ipi = num(row.total_ipi as number | null);
  const freight_cost = num(row.freight_cost as number | null);
  const insurance_cost = num(row.insurance_cost as number | null);
  const other_costs = num(row.other_costs as number | null);
  const total_tax_non_creditable = num(
    row.total_tax_non_creditable as number | null
  );
  const total =
    row.total != null
      ? num(row.total as number)
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

  const order: PurchaseOrderPrintData = {
    id: String(row.id),
    po_number: String(row.po_number),
    order_date: String(row.order_date),
    expected_delivery: (row.expected_delivery as string | null) ?? null,
    status: String(row.status ?? "draft"),
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
    notes: (row.notes as string | null) ?? null,
    payment_installments: Number(row.payment_installments ?? 1),
    payment_days_to_first_due: Number(row.payment_days_to_first_due ?? 30),
    payment_days_between_installments: Number(
      row.payment_days_between_installments ?? 0
    ),
    supplier: mapSupplier(supplierRaw ?? null),
    items: mapItems(itemsRaw),
  };

  const { data: company } = await admin
    .from("company_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return { order, company: company ?? null };
}
