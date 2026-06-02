import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  addDaysToISODate,
  splitAmountInInstallments,
} from "@/modules/vendas/lib/sales/sales-flow";
import {
  computePurchaseOrderTotal,
  type PurchaseOrderExtraCosts,
} from "@/modules/compras/lib/purchasing/purchase-order-totals";

type Admin = SupabaseClient<Database>;

export type PurchaseOrderForPayables = PurchaseOrderExtraCosts & {
  id: string;
  po_number: string;
  order_date: string;
  supplier_id: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
};

type PurchaseOrderPayableRow = {
  id: string;
  po_number: string;
  order_date: string;
  supplier_id: string | null;
  payment_installments?: number | null;
  payment_days_to_first_due?: number | null;
  payment_days_between_installments?: number | null;
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total_ipi?: number | null;
  freight_cost?: number | null;
  insurance_cost?: number | null;
  other_costs?: number | null;
  total_tax_non_creditable?: number | null;
};

export function purchaseOrderRowToPayablesInput(
  row: PurchaseOrderPayableRow
): PurchaseOrderForPayables {
  return {
    id: row.id,
    po_number: row.po_number,
    order_date: row.order_date,
    supplier_id: row.supplier_id,
    payment_installments: row.payment_installments ?? 1,
    payment_days_to_first_due: row.payment_days_to_first_due ?? 30,
    payment_days_between_installments:
      row.payment_days_between_installments ?? 0,
    subtotal: row.subtotal,
    discount: row.discount,
    tax: row.tax,
    total_ipi: row.total_ipi,
    freight_cost: row.freight_cost,
    insurance_cost: row.insurance_cost,
    other_costs: row.other_costs,
    total_tax_non_creditable: row.total_tax_non_creditable,
  };
}

export type GeneratePayablesResult = {
  created: number;
  skipped?: string;
  lockedSkipped?: number;
  warnings?: string[];
};

export type SyncPayablesResult = {
  updated: number;
  lockedSkipped: number;
  warnings: string[];
};

const PAYABLE_SOURCE_PO = "purchase_order";
const PO_STATUSES_WITH_PAYABLES = new Set([
  "confirmed",
  "partial",
  "received",
]);

export function purchaseOrderPayableTotal(
  order: PurchaseOrderExtraCosts
): number {
  return computePurchaseOrderTotal(order);
}

function appendNote(existing: string | null, line: string): string {
  const base = (existing ?? "").trim();
  return base ? `${base}\n${line}` : line;
}

function formatNoteDate(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Monta linhas de parcelas (valores + datas) para um pedido. */
export function buildPurchaseOrderPayableRows(
  tenantId: string,
  order: PurchaseOrderForPayables
): Database["public"]["Tables"]["accounts_payable"]["Insert"][] {
  const total = purchaseOrderPayableTotal(order);
  if (total <= 0) return [];

  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const amounts = splitAmountInInstallments(total, n);
  const baseDate = order.order_date.slice(0, 10);
  let due = addDaysToISODate(baseDate, order.payment_days_to_first_due ?? 30);
  const rows: Database["public"]["Tables"]["accounts_payable"]["Insert"][] = [];

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      due = addDaysToISODate(
        due,
        order.payment_days_between_installments ?? 0
      );
    }
    const amt = amounts[i] ?? 0;
    rows.push({
      tenant_id: tenantId,
      purchase_order_id: order.id,
      source_kind: PAYABLE_SOURCE_PO,
      installment_index: i + 1,
      is_forecast: false,
      amount_locked: false,
      description: `Parcela ${i + 1}/${n} — PC ${order.po_number}`,
      category: "Fornecedor",
      supplier_id: order.supplier_id,
      original_amount: amt,
      current_amount: amt,
      due_date: due,
      status: "pending",
      notes: null,
    });
  }

  return rows;
}

/** Gera parcelas se ainda não existirem títulos do PC. */
export async function generatePayablesForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  order: PurchaseOrderForPayables
): Promise<GeneratePayablesResult> {
  const total = purchaseOrderPayableTotal(order);
  if (total <= 0) {
    return { created: 0, skipped: "total_zero" };
  }

  const { count, error: cErr } = await admin
    .from("accounts_payable")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", order.id);

  if (cErr) return { created: 0, skipped: cErr.message };
  if ((count ?? 0) > 0) {
    return { created: 0, skipped: "already_exists" };
  }

  const rows = buildPurchaseOrderPayableRows(tenantId, order);
  if (!rows.length) return { created: 0, skipped: "no_rows" };

  const { error } = await admin.from("accounts_payable").insert(rows);
  if (error) return { created: 0, skipped: error.message };
  return { created: rows.length };
}

/**
 * Recalcula parcelas pendentes não travadas e sem pagamento parcial.
 * Parcelas com amount_locked ou saldo ≠ original não são alteradas.
 */
export async function syncPayablesForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  order: PurchaseOrderForPayables
): Promise<SyncPayablesResult> {
  const warnings: string[] = [];
  const total = purchaseOrderPayableTotal(order);
  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const targetAmounts = splitAmountInInstallments(total, n);

  const { data: existing, error: loadErr } = await admin
    .from("accounts_payable")
    .select(
      "id, installment_index, original_amount, current_amount, status, amount_locked, notes"
    )
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", order.id)
    .eq("source_kind", PAYABLE_SOURCE_PO)
    .order("installment_index", { ascending: true });

  if (loadErr) {
    return { updated: 0, lockedSkipped: 0, warnings: [loadErr.message] };
  }
  if (!existing?.length) {
    return { updated: 0, lockedSkipped: 0, warnings };
  }

  let updated = 0;
  let lockedSkipped = 0;

  for (const row of existing) {
    const idx = (row.installment_index ?? 1) - 1;
    const newAmt = targetAmounts[idx];
    if (newAmt === undefined) continue;

    const orig = Number(row.original_amount ?? 0);
    const cur = Number(row.current_amount ?? 0);
    const hasPayment = Math.abs(cur - orig) > 0.001;

    if (row.amount_locked) {
      lockedSkipped += 1;
      if (Math.abs(newAmt - orig) > 0.001) {
        warnings.push(
          `Parcela ${row.installment_index ?? "?"} travada — valor do PC mudou para ${newAmt.toFixed(2)}, mantido ${orig.toFixed(2)}.`
        );
      }
      continue;
    }

    if (row.status !== "pending" || hasPayment) {
      lockedSkipped += 1;
      if (Math.abs(newAmt - orig) > 0.001) {
        warnings.push(
          `Parcela ${row.installment_index ?? "?"} (${row.status}) não recalculada — requer decisão manual.`
        );
      }
      continue;
    }

    if (Math.abs(newAmt - orig) < 0.001) continue;

    const { error } = await admin
      .from("accounts_payable")
      .update({
        original_amount: newAmt,
        current_amount: newAmt,
      })
      .eq("id", row.id)
      .eq("tenant_id", tenantId);

    if (error) {
      warnings.push(`Parcela ${row.installment_index}: ${error.message}`);
    } else {
      updated += 1;
    }
  }

  return { updated, lockedSkipped, warnings };
}

export function shouldManagePayablesForStatus(status: string): boolean {
  return PO_STATUSES_WITH_PAYABLES.has(status);
}

export async function ensurePayablesForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  order: PurchaseOrderForPayables,
  ctx: { previousStatus: string; currentStatus: string }
): Promise<{
  generate?: GeneratePayablesResult;
  sync?: SyncPayablesResult;
}> {
  const { previousStatus, currentStatus } = ctx;
  if (!shouldManagePayablesForStatus(currentStatus)) {
    return {};
  }

  const enteringPayableStatus =
    !shouldManagePayablesForStatus(previousStatus) &&
    shouldManagePayablesForStatus(currentStatus);

  if (enteringPayableStatus) {
    const generate = await generatePayablesForPurchaseOrder(
      admin,
      tenantId,
      order
    );
    return { generate };
  }

  if (shouldManagePayablesForStatus(previousStatus)) {
    const sync = await syncPayablesForPurchaseOrder(admin, tenantId, order);
    return { sync };
  }

  return {};
}

export function formatManualAdjustmentNote(
  previousAmount: number,
  newAmount: number
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  return `Ajuste manual: ${fmt(previousAmount)} → ${fmt(newAmount)} em ${formatNoteDate()}.`;
}

export { appendNote };

export type PayableRecalcDryRunRow = {
  payable_id: string;
  purchase_order_id: string;
  po_number: string;
  installment_index: number | null;
  description: string;
  status: string;
  amount_locked: boolean;
  old_original_amount: number;
  old_current_amount: number;
  new_amount: number;
  po_total: number;
};

export type PayableRecalcSkippedRow = {
  payable_id: string;
  po_number: string;
  installment_index: number | null;
  status: string;
  amount_locked: boolean;
  original_amount: number;
  current_amount: number;
  reason: string;
};

export type PayableRecalcDryRunResult = {
  would_update: PayableRecalcDryRunRow[];
  skipped: PayableRecalcSkippedRow[];
};

/** Lista candidatos ao recálculo em massa (dry run — não altera dados). */
export async function listPayablesRecalcDryRun(
  admin: Admin,
  tenantId: string
): Promise<PayableRecalcDryRunResult> {
  const would_update: PayableRecalcDryRunRow[] = [];
  const skipped: PayableRecalcSkippedRow[] = [];

  let payables:
    | {
        id: string;
        purchase_order_id: string | null;
        installment_index: number | null;
        description: string;
        status: string;
        amount_locked?: boolean;
        original_amount: number;
        current_amount: number;
      }[]
    | null = null;

  const selectWithLock =
    "id, purchase_order_id, installment_index, description, status, amount_locked, original_amount, current_amount";
  const { data: withLock, error: errLock } = await admin
    .from("accounts_payable")
    .select(selectWithLock)
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null);

  if (errLock?.code === "42703") {
    const { data: withoutLock, error: errPlain } = await admin
      .from("accounts_payable")
      .select(
        "id, purchase_order_id, installment_index, description, status, original_amount, current_amount"
      )
      .eq("tenant_id", tenantId)
      .not("purchase_order_id", "is", null);
    if (errPlain) {
      return { would_update, skipped };
    }
    payables = (withoutLock ?? []).map((row) => ({
      ...row,
      amount_locked: false,
    }));
  } else if (errLock) {
    return { would_update, skipped };
  } else {
    payables = withLock;
  }

  if (!payables?.length) {
    return { would_update, skipped };
  }

  const poIds = [
    ...new Set(
      payables
        .map((p) => p.purchase_order_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: orders, error: poErr } = await admin
    .from("purchase_orders")
    .select(
      "id, po_number, order_date, supplier_id, subtotal, discount, tax, total_ipi, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments"
    )
    .eq("tenant_id", tenantId)
    .in("id", poIds);

  if (poErr || !orders?.length) {
    return { would_update, skipped };
  }

  const poById = new Map(orders.map((o) => [o.id, o]));

  const targetByPo = new Map<string, number[]>();
  for (const po of orders) {
    const input = purchaseOrderRowToPayablesInput(po);
    const total = purchaseOrderPayableTotal(input);
    const n = Math.max(1, Math.min(999, input.payment_installments ?? 1));
    targetByPo.set(po.id, splitAmountInInstallments(total, n));
  }

  for (const row of payables) {
    const poId = row.purchase_order_id;
    if (!poId) continue;
    const po = poById.get(poId);
    const poNumber = po?.po_number ?? poId;
    const orig = Number(row.original_amount ?? 0);
    const cur = Number(row.current_amount ?? 0);
    const hasPayment = Math.abs(cur - orig) > 0.001;
    const targets = targetByPo.get(poId);
    const idx = (row.installment_index ?? 1) - 1;
    const newAmt = targets?.[idx];
    const poTotal = po
      ? purchaseOrderPayableTotal(purchaseOrderRowToPayablesInput(po))
      : 0;

    const baseSkip = {
      payable_id: row.id,
      po_number: poNumber,
      installment_index: row.installment_index,
      status: row.status,
      amount_locked: Boolean(row.amount_locked),
      original_amount: orig,
      current_amount: cur,
    };

    if (row.amount_locked) {
      skipped.push({
        ...baseSkip,
        reason: "amount_locked",
      });
      continue;
    }
    if (row.status !== "pending") {
      skipped.push({
        ...baseSkip,
        reason: `status_${row.status}`,
      });
      continue;
    }
    if (hasPayment) {
      skipped.push({
        ...baseSkip,
        reason: "partial_payment",
      });
      continue;
    }
    if (newAmt === undefined) {
      skipped.push({
        ...baseSkip,
        reason: "installment_index_out_of_range",
      });
      continue;
    }
    if (Math.abs(newAmt - orig) < 0.001) {
      continue;
    }

    would_update.push({
      payable_id: row.id,
      purchase_order_id: poId,
      po_number: poNumber,
      installment_index: row.installment_index,
      description: row.description,
      status: row.status,
      amount_locked: false,
      old_original_amount: orig,
      old_current_amount: cur,
      new_amount: newAmt,
      po_total: poTotal,
    });
  }

  return { would_update, skipped };
}

/** Aplica recálculo em massa (apenas linhas elegíveis). Usar só após aprovação explícita. */
export async function applyPayablesRecalc(
  admin: Admin,
  tenantId: string
): Promise<{ updated: number; errors: string[] }> {
  const dry = await listPayablesRecalcDryRun(admin, tenantId);
  let updated = 0;
  const errors: string[] = [];

  for (const row of dry.would_update) {
    const { error } = await admin
      .from("accounts_payable")
      .update({
        original_amount: row.new_amount,
        current_amount: row.new_amount,
      })
      .eq("id", row.payable_id)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .eq("amount_locked", false);

    if (error) {
      errors.push(`${row.po_number} #${row.installment_index}: ${error.message}`);
    } else {
      updated += 1;
    }
  }

  return { updated, errors };
}
