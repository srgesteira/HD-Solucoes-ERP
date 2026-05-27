import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Admin = SupabaseClient<Database>;

/** Aplique supabase/migrations/20260822150000_add_suggested_supplier_id_to_poi.sql se vir erro de coluna. */
export const REQUISITIONS_MIGRATION_HINT =
  "Aplique as migrations no Supabase: supabase db push (arquivo 20260822150000_add_suggested_supplier_id_to_poi.sql).";

export type PurchaseRequisitionRow = {
  id: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  description: string;
  quantity: number;
  unit: string;
  sales_order_id: string | null;
  sales_order_number: string | null;
  sales_order_item_id: string | null;
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  suggested_supplier_id: string | null;
  suggested_supplier_name: string | null;
  need_date: string | null;
  expected_date: string | null;
  follow_up_date: string | null;
  trace_key: string | null;
  production_order_id: string | null;
  production_order_number: string | null;
  production_order_item_id: string | null;
  quotation_sent_at: string | null;
  is_external_labor: boolean;
};

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  return String(v).slice(0, 10);
}

export function isMissingColumnError(
  error: { message?: string } | null,
  column: string
): boolean {
  const msg = error?.message ?? "";
  return (
    msg.includes(column) &&
    (msg.includes("does not exist") || msg.includes("Could not find"))
  );
}

export function isMigrationRequiredError(message: string): boolean {
  return (
    isMissingColumnError({ message }, "suggested_supplier_id") ||
    isMissingColumnError({ message }, "need_date")
  );
}

function isSupplierJoinError(message: string): boolean {
  return (
    message.includes("purchase_order_items_suggested_supplier_id_fkey") ||
    message.includes("Could not find a relationship") ||
    (message.includes("suggested_supplier") && message.includes("suppliers"))
  );
}

type SelectOptions = {
  includeNeedDate: boolean;
  includeSuggestedSupplierId: boolean;
  includeSupplierJoin: boolean;
};

function requisitionSelect(opts: SelectOptions): string {
  const needDateLine = opts.includeNeedDate ? "      need_date,\n" : "";
  const suggestedIdLine = opts.includeSuggestedSupplierId
    ? "      suggested_supplier_id,\n"
    : "";
  const supplierJoinLine = opts.includeSupplierJoin
    ? "      suggested_supplier:suppliers!purchase_order_items_suggested_supplier_id_fkey(id, name, legal_name),\n"
    : "";
  return `
      id,
      product_id,
      description,
      quantity,
      unit,
      sales_order_item_id,
      follow_up_date,
${needDateLine}${suggestedIdLine}${supplierJoinLine}      trace_key,
      quotation_sent_at,
      production_order_item_id,
      production_order_id,
      production_order_item:order_items!purchase_order_items_production_order_item_id_fkey(
        id,
        order_id,
        production_order:production_orders!order_items_order_id_fkey(
          id,
          order_number
        )
      ),
      product:products!purchase_order_items_product_id_fkey(
        technical_code,
        name,
        preferred_supplier_id,
        default_is_external_labor,
        preferred_supplier:suppliers!products_preferred_supplier_id_fkey(id, name, legal_name)
      ),
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
    `;
}

type SupplierEmbed = { id: string; name: string; legal_name: string | null };

type RequisitionQueryRow = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  sales_order_item_id: string | null;
  follow_up_date: string | null;
  need_date?: string | null;
  suggested_supplier_id?: string | null;
  suggested_supplier?: SupplierEmbed | SupplierEmbed[] | null;
  trace_key: string | null;
  quotation_sent_at: string | null;
  production_order_item_id: string | null;
  production_order_id: string | null;
  production_order_item: unknown;
  product: unknown;
  sales_order_item: unknown;
};

async function queryRequisitionRows(
  admin: Admin,
  tenantId: string,
  opts: SelectOptions
): Promise<{ data: RequisitionQueryRow[] | null; error: { message: string } | null }> {
  const q = admin
    .from("purchase_order_items")
    .select(requisitionSelect(opts))
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .is("purchase_order_id", null)
    .not("sales_order_item_id", "is", null);

  const result = opts.includeNeedDate
    ? await q.order("need_date", { ascending: true, nullsFirst: false })
    : await q.order("follow_up_date", { ascending: true, nullsFirst: false });

  return {
    data: (result.data ?? null) as RequisitionQueryRow[] | null,
    error: result.error,
  };
}

async function loadSuppliersById(
  admin: Admin,
  tenantId: string,
  ids: string[]
): Promise<Map<string, SupplierEmbed>> {
  const map = new Map<string, SupplierEmbed>();
  if (!ids.length) return map;
  const { data, error } = await admin
    .from("suppliers")
    .select("id, name, legal_name")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const s of data ?? []) {
    map.set(s.id, s);
  }
  return map;
}

function supplierLabel(s: SupplierEmbed | null | undefined): string | null {
  if (!s) return null;
  return s.legal_name?.trim() || s.name?.trim() || null;
}

function mapRequisitionRows(
  poiRows: RequisitionQueryRow[],
  opts: SelectOptions,
  supplierById: Map<string, SupplierEmbed>
): PurchaseRequisitionRow[] {
  const rows: PurchaseRequisitionRow[] = [];

  for (const row of poiRows) {
    const soi = Array.isArray(row.sales_order_item)
      ? row.sales_order_item[0]
      : row.sales_order_item;
    const so = soi?.sales_order
      ? Array.isArray(soi.sales_order)
        ? soi.sales_order[0]
        : soi.sales_order
      : null;

    const product = row.product
      ? Array.isArray(row.product)
        ? row.product[0]
        : row.product
      : null;

    const prefSupplier = product?.preferred_supplier
      ? Array.isArray(product.preferred_supplier)
        ? product.preferred_supplier[0]
        : product.preferred_supplier
      : null;

    const oi = row.production_order_item
      ? Array.isArray(row.production_order_item)
        ? row.production_order_item[0]
        : row.production_order_item
      : null;
    const prOp = oi?.production_order
      ? Array.isArray(oi.production_order)
        ? oi.production_order[0]
        : oi.production_order
      : null;

    const expected =
      dateOnly(soi?.pcp_deadline) ?? dateOnly(so?.expected_delivery);

    const suggestedFromJoin = row.suggested_supplier
      ? Array.isArray(row.suggested_supplier)
        ? row.suggested_supplier[0]
        : row.suggested_supplier
      : null;

    const dbSuggestedId = opts.includeSuggestedSupplierId
      ? row.suggested_supplier_id ?? null
      : null;

    const suggestedName =
      supplierLabel(suggestedFromJoin) ??
      (dbSuggestedId ? supplierLabel(supplierById.get(dbSuggestedId)) : null);

    rows.push({
      id: row.id,
      product_id: row.product_id,
      product_code: product?.technical_code ?? null,
      product_name: product?.name ?? null,
      description: row.description,
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "UN",
      sales_order_id: so?.id ?? null,
      sales_order_number: so?.order_number ?? null,
      sales_order_item_id: row.sales_order_item_id,
      preferred_supplier_id: product?.preferred_supplier_id ?? null,
      preferred_supplier_name: supplierLabel(prefSupplier),
      suggested_supplier_id: dbSuggestedId,
      suggested_supplier_name: suggestedName,
      need_date:
        (opts.includeNeedDate ? dateOnly(row.need_date ?? null) : null) ??
        dateOnly(row.follow_up_date) ??
        expected,
      expected_date: expected,
      follow_up_date: dateOnly(row.follow_up_date),
      trace_key: row.trace_key ?? null,
      production_order_item_id: row.production_order_item_id ?? oi?.id ?? null,
      production_order_id: prOp?.id ?? row.production_order_id ?? oi?.order_id ?? null,
      production_order_number: prOp?.order_number ?? null,
      quotation_sent_at: row.quotation_sent_at ?? null,
      is_external_labor: Boolean(product?.default_is_external_labor),
    });
  }

  return rows.sort((a, b) => {
    const fa = a.need_date ?? a.follow_up_date ?? a.expected_date ?? "9999-12-31";
    const fb = b.need_date ?? b.follow_up_date ?? b.expected_date ?? "9999-12-31";
    if (fa !== fb) return fa.localeCompare(fb);
    return (a.sales_order_number ?? "").localeCompare(b.sales_order_number ?? "");
  });
}

export async function fetchPurchaseRequisitions(
  admin: Admin,
  tenantId: string
): Promise<PurchaseRequisitionRow[]> {
  let includeNeedDate = true;
  let includeSuggestedSupplierId = true;
  let includeSupplierJoin = true;

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: poiRows, error } = await queryRequisitionRows(admin, tenantId, {
      includeNeedDate,
      includeSuggestedSupplierId,
      includeSupplierJoin,
    });

    if (!error) {
      const rows = poiRows ?? [];
      const supplierIds = new Set<string>();
      if (includeSuggestedSupplierId && !includeSupplierJoin) {
        for (const row of rows) {
          if (row.suggested_supplier_id) {
            supplierIds.add(row.suggested_supplier_id);
          }
        }
      }
      const supplierById = await loadSuppliersById(
        admin,
        tenantId,
        [...supplierIds]
      );
      return mapRequisitionRows(
        rows,
        { includeNeedDate, includeSuggestedSupplierId, includeSupplierJoin },
        supplierById
      );
    }

    if (includeNeedDate && isMissingColumnError(error, "need_date")) {
      includeNeedDate = false;
      continue;
    }

    if (
      includeSuggestedSupplierId &&
      isMissingColumnError(error, "suggested_supplier_id")
    ) {
      includeSuggestedSupplierId = false;
      includeSupplierJoin = false;
      continue;
    }

    if (includeSupplierJoin && isSupplierJoinError(error.message)) {
      includeSupplierJoin = false;
      continue;
    }

    if (isMigrationRequiredError(error.message)) {
      throw new Error(`${error.message}\n\n${REQUISITIONS_MIGRATION_HINT}`);
    }
    throw new Error(error.message);
  }

  throw new Error(REQUISITIONS_MIGRATION_HINT);
}

/** Contagem simples: draft + sem pedido (não depende de suggested_supplier_id nem need_date). */
export async function countPurchaseRequisitions(
  admin: Admin,
  tenantId: string
): Promise<number> {
  const { count, error } = await admin
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .is("purchase_order_id", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
