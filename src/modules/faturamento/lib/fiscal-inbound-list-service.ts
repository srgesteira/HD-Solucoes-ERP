import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { isFiscalConfigured } from "@/modules/fiscal/lib/fiscal-rules-types";
import {
  FISCAL_INBOUND_ORDER_STATUSES,
  type FiscalInboundListTab,
} from "@/modules/faturamento/lib/fiscal-inbound-list-tabs";

type Admin = SupabaseClient<Database>;

export type FiscalInboundListRow = {
  id: string;
  order_number: string;
  supplier_name: string | null;
  order_date: string;
  status: string;
  total: number;
  fiscal_status: string | null;
  freight_cost: number | null;
};

export type FiscalInboundListResult = {
  data: FiscalInboundListRow[];
  pagination: { page: number; limit: number; total: number };
  tab: FiscalInboundListTab;
};

function matchesTab(tab: FiscalInboundListTab, row: FiscalInboundListRow): boolean {
  const fiscal = row.fiscal_status ?? "pending";
  const configured = isFiscalConfigured(fiscal);

  switch (tab) {
    case "to_review":
      return (
        (row.status === "sent" ||
          row.status === "confirmed" ||
          row.status === "partial") &&
        !configured
      );
    case "ready_to_receive":
      return (
        (row.status === "confirmed" || row.status === "partial") && configured
      );
    case "received":
      return row.status === "received";
    default:
      return true;
  }
}

export async function listFiscalInboundOrders(
  admin: Admin,
  tenantId: string,
  opts: {
    tab: FiscalInboundListTab;
    search: string;
    page: number;
    limit: number;
  }
): Promise<FiscalInboundListResult> {
  const { tab, search, page, limit } = opts;
  const db = asUntypedAdmin(admin);

  let query = db
    .from("purchase_orders")
    .select(
      "id, po_number, order_date, status, total, fiscal_status, freight_cost, supplier:suppliers(name)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("status", [...FISCAL_INBOUND_ORDER_STATUSES])
    .order("order_date", { ascending: false });

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`po_number.ilike.${q}`);
  }

  const fetchLimit = Math.min(500, Math.max(limit * 10, 100));
  const { data, error } = await query.limit(fetchLimit);
  if (error) throw new Error(error.message);

  const rows: FiscalInboundListRow[] = (data ?? []).map((raw) => {
    const r = raw as {
      id: string;
      po_number: string;
      order_date: string;
      status: string;
      total: number | null;
      fiscal_status: string | null;
      freight_cost: number | null;
      supplier?: { name?: string | null } | { name?: string | null }[] | null;
    };
    const supplier = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    return {
      id: r.id,
      order_number: r.po_number,
      supplier_name: supplier?.name ?? null,
      order_date: r.order_date,
      status: r.status,
      total: Number(r.total ?? 0),
      fiscal_status: r.fiscal_status,
      freight_cost:
        r.freight_cost == null ? null : Number(r.freight_cost),
    };
  });

  const filtered = rows.filter((row) => matchesTab(tab, row));
  const total = filtered.length;
  const from = (page - 1) * limit;
  const pageRows = filtered.slice(from, from + limit);

  return {
    data: pageRows,
    pagination: { page, limit, total },
    tab,
  };
}
