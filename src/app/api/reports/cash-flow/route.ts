import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import {
  cashFlowDateForReceivableOrPayable,
  type OrderPaymentTerms,
} from "@/modules/finance/lib/cash-flow-projection-dates";
import { projectFixedExpensesToOutByDay } from "@/modules/finance/lib/fixed-expenses-projection";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

type ReceivableRow = {
  id: string;
  due_date: string;
  current_amount: number | null;
  is_forecast: boolean;
  sales_order_id: string | null;
  installment_index: number | null;
};

type PayableRow = {
  id: string;
  due_date: string;
  current_amount: number | null;
  is_forecast: boolean;
  purchase_order_id: string | null;
  installment_index: number | null;
};

/**
 * GET /api/reports/cash-flow?horizon=90
 * Projeção: entradas (receivables) vs saídas (AP + PCs confirmados sem AP).
 * Provisórios: data = expected_delivery + prazo de pagamento por parcela.
 */
export async function GET(request: NextRequest) {
  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const horizon = Math.min(
    120,
    Math.max(30, parseInt(request.nextUrl.searchParams.get("horizon") ?? "90", 10) || 90)
  );

  const admin = createSupabaseAdminClient();

  const { data: companyRow, error: companyErr } = await admin
    .from("company_settings")
    .select("cash_flow_opening_balance")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (companyErr) {
    return apiError("Configurações da empresa: " + companyErr.message, 500);
  }

  const openingBalance = Number(companyRow?.cash_flow_opening_balance ?? 0);
  const openingBalanceSafe = Number.isFinite(openingBalance) ? openingBalance : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: receivables, error: rErr } = await admin
    .from("receivables")
    .select(
      "id, due_date, current_amount, status, client_name, is_forecast, sales_order_id, installment_index"
    )
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial"]);

  if (rErr) {
    return apiError("Recebíveis: " + rErr.message, 500);
  }

  const { data: payables, error: apErr } = await admin
    .from("accounts_payable")
    .select(
      "id, due_date, current_amount, status, is_forecast, purchase_order_id, installment_index"
    )
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial"]);

  if (apErr) {
    return apiError("Contas a pagar: " + apErr.message, 500);
  }

  const salesOrderIds = [
    ...new Set(
      (receivables ?? [])
        .map((r) => r.sales_order_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const purchaseOrderIds = [
    ...new Set(
      (payables ?? [])
        .map((ap) => ap.purchase_order_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const salesOrderTerms = new Map<string, OrderPaymentTerms>();
  if (salesOrderIds.length > 0) {
    const { data: salesOrders, error: soErr } = await admin
      .from("sales_orders")
      .select(
        "id, expected_delivery, payment_days_to_first_due, payment_days_between_installments"
      )
      .eq("tenant_id", tenantId)
      .in("id", salesOrderIds);
    if (soErr) {
      return apiError("Pedidos de venda: " + soErr.message, 500);
    }
    for (const o of salesOrders ?? []) {
      salesOrderTerms.set(o.id, {
        expected_delivery: o.expected_delivery,
        payment_days_to_first_due: o.payment_days_to_first_due ?? 30,
        payment_days_between_installments:
          o.payment_days_between_installments ?? 0,
      });
    }
  }

  const purchaseOrderTerms = new Map<string, OrderPaymentTerms>();
  if (purchaseOrderIds.length > 0) {
    const { data: purchaseOrders, error: poErr } = await admin
      .from("purchase_orders")
      .select(
        "id, expected_delivery, payment_days_to_first_due, payment_days_between_installments"
      )
      .eq("tenant_id", tenantId)
      .in("id", purchaseOrderIds);
    if (poErr) {
      return apiError("Pedidos de compra: " + poErr.message, 500);
    }
    for (const o of purchaseOrders ?? []) {
      purchaseOrderTerms.set(o.id, {
        expected_delivery: o.expected_delivery,
        payment_days_to_first_due: o.payment_days_to_first_due ?? 30,
        payment_days_between_installments:
          o.payment_days_between_installments ?? 0,
      });
    }
  }

  const projectionFallbacks: string[] = [];

  const inByDay = new Map<string, number>();
  for (const r of (receivables ?? []) as ReceivableRow[]) {
    const order = r.sales_order_id
      ? salesOrderTerms.get(r.sales_order_id)
      : undefined;
    const projected = cashFlowDateForReceivableOrPayable(
      r.is_forecast === true,
      order,
      r.installment_index,
      r.due_date
    );
    if (projected.usedFallback && r.is_forecast) {
      projectionFallbacks.push(`receivable:${r.id}`);
    }
    const k = projected.date;
    if (!k) continue;
    const amt = Number(r.current_amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    inByDay.set(k, (inByDay.get(k) ?? 0) + amt);
  }

  const outByDay = new Map<string, number>();
  const poIdsWithAp = new Set<string>();

  for (const ap of (payables ?? []) as PayableRow[]) {
    const order = ap.purchase_order_id
      ? purchaseOrderTerms.get(ap.purchase_order_id)
      : undefined;
    const projected = cashFlowDateForReceivableOrPayable(
      ap.is_forecast === true,
      order,
      ap.installment_index,
      ap.due_date
    );
    if (projected.usedFallback && ap.is_forecast) {
      projectionFallbacks.push(`payable:${ap.id}`);
    }
    const k = projected.date;
    if (!k) continue;
    const amt = Number(ap.current_amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    outByDay.set(k, (outByDay.get(k) ?? 0) + amt);
  }

  const { data: apPoLinks } = await admin
    .from("accounts_payable")
    .select("purchase_order_id")
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null);

  for (const row of apPoLinks ?? []) {
    if (row.purchase_order_id) poIdsWithAp.add(row.purchase_order_id);
  }

  const { data: pos, error: pErr } = await admin
    .from("purchase_orders")
    .select(
      "id, total, status, expected_delivery, order_date, po_number, payment_days_to_first_due, payment_days_between_installments"
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("status", "confirmed");

  if (pErr) {
    return apiError("Compras: " + pErr.message, 500);
  }

  for (const p of pos ?? []) {
    if (poIdsWithAp.has(p.id)) continue;
    const terms: OrderPaymentTerms = {
      expected_delivery: p.expected_delivery,
      payment_days_to_first_due: p.payment_days_to_first_due ?? 30,
      payment_days_between_installments:
        p.payment_days_between_installments ?? 0,
    };
    const projected = cashFlowDateForReceivableOrPayable(
      true,
      terms,
      1,
      p.expected_delivery ?? p.order_date
    );
    if (projected.usedFallback) {
      projectionFallbacks.push(`purchase_order:${p.id}`);
    }
    const k = projected.date ?? dayKey(p.order_date);
    if (!k) continue;
    const amt = Number(p.total ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    outByDay.set(k, (outByDay.get(k) ?? 0) + amt);
  }

  const db = asUntypedAdmin(admin);
  const { data: fixedExpenses, error: feErr } = await db
    .from("fixed_expenses")
    .select("id, amount, due_day, is_active, start_date, end_date")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (feErr) {
    return apiError("Contas fixas: " + feErr.message, 500);
  }

  const expenseIds = (fixedExpenses ?? []).map((r: { id: string }) =>
    String(r.id)
  );
  let overrides: Array<{
    fixed_expense_id: string;
    competencia: string;
    amount: number;
  }> = [];

  if (expenseIds.length > 0) {
    const rangeEndDate = new Date(today);
    rangeEndDate.setDate(rangeEndDate.getDate() + horizon);
    const competenciaStart = today.toISOString().slice(0, 7);
    const competenciaEnd = rangeEndDate.toISOString().slice(0, 7);

    const { data: overrideRows, error: ovErr } = await db
      .from("fixed_expense_overrides")
      .select("fixed_expense_id, competencia, amount")
      .eq("tenant_id", tenantId)
      .in("fixed_expense_id", expenseIds)
      .gte("competencia", competenciaStart)
      .lte("competencia", competenciaEnd);

    if (ovErr) {
      return apiError("Overrides de contas fixas: " + ovErr.message, 500);
    }
    overrides = (overrideRows ?? []).map(
      (row: { fixed_expense_id: string; competencia: string; amount: number }) => ({
        fixed_expense_id: String(row.fixed_expense_id),
        competencia: String(row.competencia),
        amount: Number(row.amount),
      })
    );
  }

  projectFixedExpensesToOutByDay(
    outByDay,
    (fixedExpenses ?? []).map(
      (row: {
        id: string;
        amount: number;
        due_day: number;
        is_active: boolean;
        start_date: string;
        end_date: string | null;
      }) => ({
      id: String(row.id),
      amount: Number(row.amount),
      due_day: Number(row.due_day),
      is_active: row.is_active === true,
      start_date: String(row.start_date),
      end_date: row.end_date ? String(row.end_date) : null,
    })),
    overrides,
    today,
    horizon
  );

  const series: Array<{
    date: string;
    inflow: number;
    outflow: number;
    net: number;
    cumulative: number;
  }> = [];

  let cumulative = openingBalanceSafe;
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const inf = inByDay.get(key) ?? 0;
    const outf = outByDay.get(key) ?? 0;
    const net = inf - outf;
    cumulative += net;
    series.push({
      date: key,
      inflow: Math.round(inf * 100) / 100,
      outflow: Math.round(outf * 100) / 100,
      net: Math.round(net * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  const summary = {
    horizon_days: horizon,
    opening_balance: Math.round(openingBalanceSafe * 100) / 100,
    total_projected_inflow: Math.round(
      series.reduce((s, x) => s + x.inflow, 0) * 100
    ) / 100,
    total_projected_outflow: Math.round(
      series.reduce((s, x) => s + x.outflow, 0) * 100
    ) / 100,
    negative_days: series.filter((x) => x.cumulative < 0).length,
  };

  if (projectionFallbacks.length > 0) {
    console.warn(
      "[cash-flow] Provisórios sem expected_delivery (usando due_date):",
      projectionFallbacks.join(", ")
    );
  }

  return apiOk({
    series,
    summary,
    meta: {
      opening_balance_source: "company_settings.cash_flow_opening_balance",
      inflow_source:
        "receivables: reais por due_date; provisórios por expected_delivery + prazo",
      outflow_source:
        "accounts_payable: reais por due_date; provisórios por expected_delivery + prazo; PCs sem AP; contas fixas mensais",
      provisional_projection_fallback_count: projectionFallbacks.length,
      provisional_projection_fallback_ids: projectionFallbacks.slice(0, 50),
    },
  });
}
