import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { computeCashFlowProjection } from "@/modules/finance/lib/cash-flow-projection";

type Admin = SupabaseClient<Database>;

const CASH_FLOW_HORIZON_DAYS = 90;
const UPCOMING_ORDER_WINDOW_DAYS = 3;

const OPEN_RECEIVABLE_STATUSES = ["pending", "partial", "overdue"] as const;
const OPEN_PAYABLE_STATUSES = ["pending", "overdue"] as const;
const OPEN_SALES_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "shipped",
] as const;
const OPEN_PURCHASE_ORDER_STATUSES = ["confirmed", "partial"] as const;

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- 1. Colisão de caixa futura -------------------------------------------

export type CashCollisionResult = {
  hasCollision: boolean;
  date: string | null;
  shortfall: number | null;
  horizonDays: number;
};

export async function checkCashCollision(
  admin: Admin,
  tenantId: string
): Promise<CashCollisionResult> {
  const projection = await computeCashFlowProjection(
    admin,
    tenantId,
    CASH_FLOW_HORIZON_DAYS
  );
  const firstNegative = projection.series.find((row) => row.cumulative < 0);
  return {
    hasCollision: Boolean(firstNegative),
    date: firstNegative?.date ?? null,
    shortfall: firstNegative ? Math.abs(firstNegative.cumulative) : null,
    horizonDays: CASH_FLOW_HORIZON_DAYS,
  };
}

// --- 2/3. Contas vencendo numa data específica (hoje / amanhã) -----------

export type DueBillsReceivable = {
  id: string;
  client_name: string | null;
  document_number: string | null;
  current_amount: number;
};

export type DueBillsPayable = {
  id: string;
  description: string;
  current_amount: number;
};

export type DueBillsResult = {
  date: string;
  receivables: DueBillsReceivable[];
  payables: DueBillsPayable[];
};

export async function checkBillsDueOn(
  admin: Admin,
  tenantId: string,
  dateIso: string
): Promise<DueBillsResult> {
  const { data: receivables, error: rErr } = await admin
    .from("receivables")
    .select("id, client_name, document_number, current_amount")
    .eq("tenant_id", tenantId)
    .eq("due_date", dateIso)
    .in("status", OPEN_RECEIVABLE_STATUSES);
  if (rErr) throw new Error("Recebíveis: " + rErr.message);

  const { data: payables, error: pErr } = await admin
    .from("accounts_payable")
    .select("id, description, current_amount")
    .eq("tenant_id", tenantId)
    .eq("due_date", dateIso)
    .in("status", OPEN_PAYABLE_STATUSES);
  if (pErr) throw new Error("Contas a pagar: " + pErr.message);

  return {
    date: dateIso,
    receivables: (receivables ?? []).map((r) => ({
      id: r.id,
      client_name: r.client_name,
      document_number: r.document_number,
      current_amount: Number(r.current_amount ?? 0),
    })),
    payables: (payables ?? []).map((p) => ({
      id: p.id,
      description: p.description,
      current_amount: Number(p.current_amount ?? 0),
    })),
  };
}

// --- 4. Pedidos de venda com entrega próxima ------------------------------

export type UpcomingSalesOrder = {
  id: string;
  order_number: string;
  client_name: string;
  expected_delivery: string;
  total: number;
};

export async function checkUpcomingSalesDeliveries(
  admin: Admin,
  tenantId: string
): Promise<UpcomingSalesOrder[]> {
  const from = todayIso();
  const to = addDaysIso(from, UPCOMING_ORDER_WINDOW_DAYS);

  const { data, error } = await admin
    .from("sales_orders")
    .select("id, order_number, client_name, expected_delivery, total, status")
    .eq("tenant_id", tenantId)
    .in("status", OPEN_SALES_ORDER_STATUSES)
    .not("expected_delivery", "is", null)
    .gte("expected_delivery", from)
    .lte("expected_delivery", to)
    .order("expected_delivery", { ascending: true });

  if (error) throw new Error("Pedidos de venda: " + error.message);

  return (data ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    client_name: o.client_name,
    expected_delivery: String(o.expected_delivery),
    total: Number(o.total ?? 0),
  }));
}

// --- 5. Pedidos de compra chegando ----------------------------------------

export type UpcomingPurchaseOrder = {
  id: string;
  po_number: string;
  supplier_name: string | null;
  expected_delivery: string;
  total: number;
};

export async function checkUpcomingPurchaseArrivals(
  admin: Admin,
  tenantId: string
): Promise<UpcomingPurchaseOrder[]> {
  const from = todayIso();
  const to = addDaysIso(from, UPCOMING_ORDER_WINDOW_DAYS);

  const { data, error } = await admin
    .from("purchase_orders")
    .select(
      "id, po_number, expected_delivery, total, status, supplier:suppliers(name)"
    )
    .eq("tenant_id", tenantId)
    .in("status", OPEN_PURCHASE_ORDER_STATUSES)
    .not("expected_delivery", "is", null)
    .gte("expected_delivery", from)
    .lte("expected_delivery", to)
    .order("expected_delivery", { ascending: true });

  if (error) throw new Error("Pedidos de compra: " + error.message);

  return (data ?? []).map((o) => ({
    id: o.id,
    po_number: o.po_number,
    supplier_name:
      (o.supplier as { name: string | null } | null)?.name ?? null,
    expected_delivery: String(o.expected_delivery),
    total: Number(o.total ?? 0),
  }));
}

// --- Orquestração ----------------------------------------------------------

export type FinanceAlertChecks = {
  cashCollision: CashCollisionResult;
  billsToday: DueBillsResult;
  billsTomorrow: DueBillsResult;
  salesDeliveries: UpcomingSalesOrder[];
  purchaseArrivals: UpcomingPurchaseOrder[];
};

export async function runFinanceAlertChecks(
  admin: Admin,
  tenantId: string
): Promise<FinanceAlertChecks> {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);

  const [
    cashCollision,
    billsToday,
    billsTomorrow,
    salesDeliveries,
    purchaseArrivals,
  ] = await Promise.all([
    checkCashCollision(admin, tenantId),
    checkBillsDueOn(admin, tenantId, today),
    checkBillsDueOn(admin, tenantId, tomorrow),
    checkUpcomingSalesDeliveries(admin, tenantId),
    checkUpcomingPurchaseArrivals(admin, tenantId),
  ]);

  return {
    cashCollision,
    billsToday,
    billsTomorrow,
    salesDeliveries,
    purchaseArrivals,
  };
}
