import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  buildSalesOrderUniversalSearchOrFilter,
  resolveSalesOrderIdsFromUniversalSearch,
} from "@/modules/core/lib/universal-search-query";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import { isWithoutInvoicePlanned } from "@/modules/faturamento/lib/sales-order-billing-display";
import { isFiscalConfigured } from "@/modules/fiscal/lib/fiscal-rules-types";
import {
  FISCAL_INVOICING_ORDER_STATUSES,
  type FiscalInvoicingListTab,
} from "@/modules/faturamento/lib/fiscal-invoicing-list-tabs";

type Admin = SupabaseClient<Database>;

type SalesOrderBase = {
  id: string;
  order_number: string;
  client_name: string;
  order_date: string;
  total: number;
  status: string;
  ready_for_invoice: boolean;
  fiscal_status: string | null;
  billing_closure: string | null;
  billing_plan: string | null;
  invoice_document_type: string | null;
};

type NfeSummary = {
  id: string;
  status: string;
  nfe_number: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  error_message: string | null;
  provider: string | null;
  updated_at: string;
};

export type FiscalInvoicingListRow = SalesOrderBase & {
  credit_status: string | null;
  nfe_id: string | null;
  nfe_status: string | null;
  nfe_number: string | null;
  nfe_pdf_url: string | null;
  nfe_xml_url: string | null;
  nfe_error: string | null;
  nfe_provider: string | null;
  invoice_document_type: string | null;
  can_emit: boolean;
  can_confirm_without_invoice: boolean;
  emit_blockers: string[];
  emit_warnings: string[];
  unmapped_bling_skus: string[];
};

export type FiscalInvoicingListResult = {
  data: FiscalInvoicingListRow[];
  pagination: { page: number; limit: number; total: number };
  tab: FiscalInvoicingListTab;
};

async function loadLatestNfesByOrder(
  admin: Admin,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, NfeSummary>> {
  const out = new Map<string, NfeSummary>();
  if (!orderIds.length) return out;

  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("nfes")
    .select(
      "id, sales_order_id, status, nfe_number, pdf_url, xml_url, error_message, provider, updated_at"
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_id", orderIds)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const soId = row.sales_order_id;
    if (!soId || out.has(soId)) continue;
    out.set(soId, {
      id: row.id,
      status: row.status,
      nfe_number: row.nfe_number,
      pdf_url: (row as { pdf_url?: string | null }).pdf_url ?? null,
      xml_url: (row as { xml_url?: string | null }).xml_url ?? null,
      error_message: (row as { error_message?: string | null }).error_message ?? null,
      provider: (row as { provider?: string | null }).provider ?? null,
      updated_at: row.updated_at,
    });
  }
  return out;
}

async function loadCreditStatusByOrder(
  admin: Admin,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!orderIds.length) return out;

  const { data, error } = await admin
    .from("credit_analysis")
    .select("sales_order_ref, status")
    .eq("tenant_id", tenantId)
    .in("sales_order_ref", orderIds);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (row.sales_order_ref) {
      out.set(row.sales_order_ref, row.status);
    }
  }
  return out;
}

async function loadUnmappedBlingSkusByOrder(
  admin: Admin,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!orderIds.length) return out;
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("sales_order_items")
    .select(
      "sales_order_id, product_id, product:products!sales_order_items_product_id_fkey(code, technical_code, name, bling_product_id)"
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_id", orderIds);
  if (error) throw new Error(error.message);

  for (const raw of data ?? []) {
    const row = raw as {
      sales_order_id: string;
      product_id: string | null;
      product?:
        | {
            code: string | null;
            technical_code: string | null;
            name: string | null;
            bling_product_id: number | null;
          }
        | Array<{
            code: string | null;
            technical_code: string | null;
            name: string | null;
            bling_product_id: number | null;
          }>
        | null;
    };
    if (!row.product_id) continue;
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    if (!product || product.bling_product_id) continue;
    const sku = (
      product.code ??
      product.technical_code ??
      product.name ??
      row.product_id
    ).trim();
    const list = out.get(row.sales_order_id) ?? [];
    if (!list.includes(sku)) list.push(sku);
    out.set(row.sales_order_id, list);
  }
  return out;
}

function isBillingOpen(row: SalesOrderBase): boolean {
  return !row.billing_closure;
}

function hasActiveNfe(nfeStatus: string | null): boolean {
  // NF em erro não bloqueia re-conferência fiscal (vai na aba «Com erro»).
  return (
    nfeStatus === "pending" ||
    nfeStatus === "processing" ||
    nfeStatus === "authorized"
  );
}

function matchesTab(
  tab: FiscalInvoicingListTab,
  row: SalesOrderBase,
  nfe: NfeSummary | undefined,
  canEmit: boolean,
  canConfirmWithoutInvoice: boolean
): boolean {
  const fiscal = row.fiscal_status ?? "pending";
  const nfeStatus = nfe?.status ?? null;
  const semNota = isWithoutInvoicePlanned(row.billing_plan);

  switch (tab) {
    case "all":
      return true;
    case "fiscal_pending":
      if (!isBillingOpen(row)) return false;
      if (semNota) return false;
      if (hasActiveNfe(nfeStatus)) return false;
      return (
        fiscal === "pending" ||
        fiscal === "no_rules" ||
        fiscal === "review_required"
      );
    case "waiting":
      if (!isBillingOpen(row)) return false;
      if (nfeStatus) return false;
      if (row.ready_for_invoice) return false;
      return semNota || isFiscalConfigured(fiscal);
    case "ready":
      if (!isBillingOpen(row)) return false;
      if (
        nfeStatus === "pending" ||
        nfeStatus === "processing" ||
        nfeStatus === "authorized"
      ) {
        return false;
      }
      if (!row.ready_for_invoice) return false;
      // Membership da coluna ≠ can_emit (crédito/status não escondem o card).
      return semNota || isFiscalConfigured(fiscal);
    case "nfe_active":
      return nfeStatus === "pending" || nfeStatus === "processing";
    case "nfe_authorized":
      return (
        nfeStatus === "authorized" || row.billing_closure === "without_invoice"
      );
    case "nfe_error":
      return nfeStatus === "error" || nfeStatus === "rejected";
    default:
      return true;
  }
}

async function loadAuthorizedTabOrderIds(
  admin: Admin,
  tenantId: string
): Promise<string[]> {
  const db = asUntypedAdmin(admin);
  const ids = new Set<string>();

  const { data: nfeRows, error: nfeErr } = await admin
    .from("nfes")
    .select("sales_order_id")
    .eq("tenant_id", tenantId)
    .eq("status", "authorized")
    .not("sales_order_id", "is", null);
  if (nfeErr) throw new Error(nfeErr.message);
  for (const row of nfeRows ?? []) {
    if (row.sales_order_id) ids.add(row.sales_order_id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closedRows, error: closedErr } = await (db.from("sales_orders") as any)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("billing_closure", "without_invoice");
  if (closedErr) throw new Error(closedErr.message);
  for (const row of (closedRows ?? []) as Array<{ id: string }>) {
    ids.add(row.id);
  }

  return [...ids];
}

export async function listFiscalInvoicingOrders(
  admin: Admin,
  tenantId: string,
  opts: {
    tab: FiscalInvoicingListTab;
    search: string;
    page: number;
    limit: number;
  }
): Promise<FiscalInvoicingListResult> {
  const { tab, search, page, limit } = opts;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const db = asUntypedAdmin(admin);

  let query = db
    .from("sales_orders")
    .select(
      "id, order_number, client_name, order_date, total, status, ready_for_invoice, fiscal_status, billing_closure, billing_plan, invoice_document_type",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .neq("status", "superseded")
    .in("status", [...FISCAL_INVOICING_ORDER_STATUSES]);

  if (search.trim()) {
    const orderIdsFromProducts = await resolveSalesOrderIdsFromUniversalSearch(
      admin,
      tenantId,
      search.trim()
    );
    const orFilter = buildSalesOrderUniversalSearchOrFilter(
      search.trim(),
      orderIdsFromProducts
    );
    if (orFilter) {
      query = query.or(orFilter);
    }
  }

  switch (tab) {
    case "fiscal_pending":
      query = query
        .is("billing_closure", null)
        .or("billing_plan.is.null,billing_plan.neq.without_invoice")
        .in("fiscal_status", ["pending", "no_rules", "review_required"]);
      break;
    case "waiting":
      query = query.is("billing_closure", null).eq("ready_for_invoice", false);
      break;
    case "ready":
      query = query
        .is("billing_closure", null)
        .eq("ready_for_invoice", true);
      break;
    case "nfe_active": {
      const { data: nfeRows, error: nfeErr } = await admin
        .from("nfes")
        .select("sales_order_id")
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "processing"])
        .not("sales_order_id", "is", null);
      if (nfeErr) throw new Error(nfeErr.message);
      const ids = [
        ...new Set(
          (nfeRows ?? [])
            .map((r) => r.sales_order_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (!ids.length) {
        return {
          data: [],
          pagination: { page, limit, total: 0 },
          tab,
        };
      }
      query = query.in("id", ids);
      break;
    }
    case "nfe_authorized": {
      const ids = await loadAuthorizedTabOrderIds(admin, tenantId);
      if (!ids.length) {
        return {
          data: [],
          pagination: { page, limit, total: 0 },
          tab,
        };
      }
      query = query.in("id", ids);
      break;
    }
    case "nfe_error": {
      const { data: nfeRows, error: nfeErr } = await admin
        .from("nfes")
        .select("sales_order_id")
        .eq("tenant_id", tenantId)
        .in("status", ["error", "rejected"])
        .not("sales_order_id", "is", null);
      if (nfeErr) throw new Error(nfeErr.message);
      const ids = [
        ...new Set(
          (nfeRows ?? [])
            .map((r) => r.sales_order_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (!ids.length) {
        return {
          data: [],
          pagination: { page, limit, total: 0 },
          tab,
        };
      }
      query = query.in("id", ids);
      break;
    }
    default:
      break;
  }

  const { data, error, count } = await query
    .order("order_date", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const baseRows = (data ?? []) as unknown as SalesOrderBase[];
  const orderIds = baseRows.map((r) => r.id);
  const [nfesByOrder, creditByOrder, unmappedByOrder] = await Promise.all([
    loadLatestNfesByOrder(admin, tenantId, orderIds),
    loadCreditStatusByOrder(admin, tenantId, orderIds),
    loadUnmappedBlingSkusByOrder(admin, tenantId, orderIds),
  ]);

  const enriched: FiscalInvoicingListRow[] = [];

  for (const row of baseRows) {
    const nfe = nfesByOrder.get(row.id);
    const gate = await validateSalesOrderCanEmitNfe(admin, tenantId, row.id);
    const fiscal = row.fiscal_status ?? "pending";
    const credit = creditByOrder.get(row.id) ?? null;
    const semNota = isWithoutInvoicePlanned(row.billing_plan);
    const canConfirmWithoutInvoice =
      semNota &&
      row.ready_for_invoice &&
      !row.billing_closure &&
      row.status !== "cancelled" &&
      credit !== "pending" &&
      credit !== "rejected" &&
      !nfe?.status;

    const item: FiscalInvoicingListRow = {
      ...row,
      total: Number(row.total ?? 0),
      ready_for_invoice: row.ready_for_invoice === true,
      credit_status: credit,
      nfe_id: nfe?.id ?? null,
      nfe_status: nfe?.status ?? null,
      nfe_number: nfe?.nfe_number ?? null,
      nfe_pdf_url: nfe?.pdf_url ?? null,
      nfe_xml_url: nfe?.xml_url ?? null,
      nfe_error: nfe?.error_message ?? null,
      nfe_provider: nfe?.provider ?? null,
      invoice_document_type: row.invoice_document_type ?? null,
      can_emit: gate.ok,
      can_confirm_without_invoice: canConfirmWithoutInvoice,
      emit_blockers: gate.reasons,
      emit_warnings: gate.warnings,
      unmapped_bling_skus:
        row.invoice_document_type === "nfe_product" ||
        row.invoice_document_type === "nfe_industrialization"
          ? unmappedByOrder.get(row.id) ?? []
          : [],
    };

    if (
      tab === "ready" ||
      tab === "waiting" ||
      tab === "all" ||
      tab === "fiscal_pending"
    ) {
      if (
        !matchesTab(
          tab,
          row,
          nfe,
          gate.ok,
          canConfirmWithoutInvoice
        )
      ) {
        continue;
      }
    }

    enriched.push(item);
  }

  let total = count ?? enriched.length;
  if (
    tab === "ready" ||
    tab === "waiting" ||
    tab === "all" ||
    tab === "fiscal_pending" ||
    tab === "nfe_authorized"
  ) {
    total = enriched.length;
  }

  return {
    data: enriched,
    pagination: { page, limit, total },
    tab,
  };
}
