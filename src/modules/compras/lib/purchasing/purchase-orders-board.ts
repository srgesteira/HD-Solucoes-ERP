import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export type PurchaseOrderBoardRow = {
  id: string;
  po_number: string;
  supplier_name: string;
  order_date: string;
  expected_delivery: string | null;
  total_value: number;
  status: string;
};

function dateOnly(v: string | null | undefined): string | null {
  if (v == null) return null;
  return String(v).slice(0, 10);
}

export type OrderSituation = "pending" | "on_time" | "late";

export function computeOrderSituation(
  status: string,
  expectedDelivery: string | null
): OrderSituation {
  const today = new Date().toISOString().slice(0, 10);
  const st = status.toLowerCase();
  if (st === "received" || st === "cancelled") return "on_time";
  const exp = dateOnly(expectedDelivery);
  if (!exp) return "pending";
  if (exp < today) return "late";
  if (st === "draft" || st === "confirmed" || st === "sent" || st === "partial") {
    return "pending";
  }
  return "on_time";
}

const OPEN_STATUSES = ["draft", "sent", "confirmed", "partial"];
const FINISHED_STATUSES = ["received"];

export async function fetchPurchaseOrdersBoard(
  admin: Admin,
  tenantId: string,
  bucket: "open" | "finished"
): Promise<PurchaseOrderBoardRow[]> {
  let query = admin
    .from("purchase_orders")
    .select(
      `
      id,
      po_number,
      order_date,
      expected_delivery,
      status,
      total,
      supplier:suppliers!purchase_orders_supplier_id_fkey(name, legal_name)
    `
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .order("order_date", { ascending: false });

  if (bucket === "open") {
    query = query.in("status", OPEN_STATUSES);
  } else {
    query = query.in("status", FINISHED_STATUSES);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const sup = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
    return {
      id: row.id,
      po_number: row.po_number,
      supplier_name:
        sup?.name?.trim() || sup?.legal_name?.trim() || "—",
      order_date: String(row.order_date).slice(0, 10),
      expected_delivery: dateOnly(row.expected_delivery),
      total_value: Number(row.total ?? 0),
      status: row.status,
    };
  });
}
