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
  is_suggestion?: boolean | null;
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
    is_suggestion: null,
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
  created: number;
  deleted: number;
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

export function buildPurchaseOrderPayableTargets(order: PurchaseOrderForPayables): {
  amounts: number[];
  dueDates: string[];
  descriptions: string[];
} {
  const total = purchaseOrderPayableTotal(order);
  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const amounts = total > 0 ? splitAmountInInstallments(total, n) : [];
  const baseDate = order.order_date.slice(0, 10);
  let due = addDaysToISODate(baseDate, order.payment_days_to_first_due ?? 30);
  const dueDates: string[] = [];
  const descriptions: string[] = [];

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      due = addDaysToISODate(
        due,
        order.payment_days_between_installments ?? 0
      );
    }
    dueDates.push(due);
    descriptions.push(`Parcela ${i + 1}/${n} — PC ${order.po_number}`);
  }

  return { amounts, dueDates, descriptions };
}

/** Monta linhas de parcelas (valores + datas) para um pedido. */
export function buildPurchaseOrderPayableRows(
  tenantId: string,
  order: PurchaseOrderForPayables
): Database["public"]["Tables"]["accounts_payable"]["Insert"][] {
  const total = purchaseOrderPayableTotal(order);
  if (total <= 0) return [];

  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const targets = buildPurchaseOrderPayableTargets(order);
  const rows: Database["public"]["Tables"]["accounts_payable"]["Insert"][] = [];

  for (let i = 0; i < n; i++) {
    const amt = targets.amounts[i] ?? 0;
    const due = targets.dueDates[i];
    if (!due) continue;
    rows.push({
      tenant_id: tenantId,
      purchase_order_id: order.id,
      source_kind: PAYABLE_SOURCE_PO,
      installment_index: i + 1,
      is_forecast: true,
      amount_locked: false,
      description: targets.descriptions[i] ?? `Parcela ${i + 1}/${n} — PC ${order.po_number}`,
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
  if (order.is_suggestion) {
    return { created: 0, skipped: "purchase_order_is_suggestion" };
  }
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

type PayableRow = {
  id: string;
  installment_index: number | null;
  original_amount: number;
  current_amount: number;
  status: string;
  amount_locked: boolean;
  due_date: string | null;
  is_forecast: boolean;
};

function payableRowIsMutable(row: PayableRow): boolean {
  const orig = Number(row.original_amount ?? 0);
  const cur = Number(row.current_amount ?? 0);
  const hasPayment = Math.abs(cur - orig) > 0.001;
  return (
    !row.amount_locked && row.status === "pending" && !hasPayment
  );
}

function isForecastForPurchaseOrderStatus(status: string): boolean {
  return status !== "received";
}

/**
 * Alinha AP ao PC: atualiza parcelas mutáveis, cria faltantes e remove excedentes
 * quando o número de parcelas ou valores/prazos mudam.
 */
export async function reconcilePayablesForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  order: PurchaseOrderForPayables,
  poStatus: string
): Promise<SyncPayablesResult> {
  const empty: SyncPayablesResult = {
    updated: 0,
    created: 0,
    deleted: 0,
    lockedSkipped: 0,
    warnings: [],
  };

  if (order.is_suggestion) return empty;

  const total = purchaseOrderPayableTotal(order);
  if (total <= 0) return empty;

  const warnings: string[] = [];
  const targets = buildPurchaseOrderPayableTargets(order);
  const n = targets.amounts.length;
  const isForecast = isForecastForPurchaseOrderStatus(poStatus);

  const { data: existing, error: loadErr } = await admin
    .from("accounts_payable")
    .select(
      "id, installment_index, original_amount, current_amount, status, amount_locked, due_date, is_forecast"
    )
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", order.id)
    .eq("source_kind", PAYABLE_SOURCE_PO)
    .order("installment_index", { ascending: true });

  if (loadErr) {
    return { ...empty, warnings: [loadErr.message] };
  }

  const byIndex = new Map<number, PayableRow>();
  for (const row of existing ?? []) {
    const idx = row.installment_index ?? 0;
    if (idx > 0 && !byIndex.has(idx)) {
      byIndex.set(idx, row as PayableRow);
    }
  }

  let updated = 0;
  let created = 0;
  let deleted = 0;
  let lockedSkipped = 0;

  for (let i = 0; i < n; i++) {
    const installment = i + 1;
    const newAmt = targets.amounts[i] ?? 0;
    const newDue = targets.dueDates[i];
    const newDesc =
      targets.descriptions[i] ??
      `Parcela ${installment}/${n} — PC ${order.po_number}`;
    if (!newDue) continue;

    const row = byIndex.get(installment);
    if (!row) {
      const { error } = await admin.from("accounts_payable").insert({
        tenant_id: tenantId,
        purchase_order_id: order.id,
        source_kind: PAYABLE_SOURCE_PO,
        installment_index: installment,
        is_forecast: isForecast,
        amount_locked: false,
        description: newDesc,
        category: "Fornecedor",
        supplier_id: order.supplier_id,
        original_amount: newAmt,
        current_amount: newAmt,
        due_date: newDue,
        status: "pending",
        notes: null,
      });
      if (error) {
        warnings.push(`Criar parcela ${installment}: ${error.message}`);
      } else {
        created += 1;
      }
      continue;
    }

    if (!payableRowIsMutable(row)) {
      lockedSkipped += 1;
      const orig = Number(row.original_amount ?? 0);
      const dueChanged =
        row.due_date && newDue !== String(row.due_date).slice(0, 10);
      if (
        Math.abs(newAmt - orig) > 0.001 ||
        dueChanged ||
        row.is_forecast !== isForecast
      ) {
        warnings.push(
          `Parcela ${installment} (${row.status}) não recalculada — requer decisão manual.`
        );
      }
      continue;
    }

    const orig = Number(row.original_amount ?? 0);
    const dueChanged =
      row.due_date && newDue !== String(row.due_date).slice(0, 10);
    const amtChanged = Math.abs(newAmt - orig) > 0.001;
    const forecastChanged = row.is_forecast !== isForecast;

    if (!amtChanged && !dueChanged && !forecastChanged) continue;

    const patch: Database["public"]["Tables"]["accounts_payable"]["Update"] = {
      description: newDesc,
      supplier_id: order.supplier_id,
      is_forecast: isForecast,
    };
    if (amtChanged) {
      patch.original_amount = newAmt;
      patch.current_amount = newAmt;
    }
    if (dueChanged) patch.due_date = newDue;

    const { error } = await admin
      .from("accounts_payable")
      .update(patch)
      .eq("id", row.id)
      .eq("tenant_id", tenantId);

    if (error) {
      warnings.push(`Parcela ${installment}: ${error.message}`);
    } else {
      updated += 1;
    }
  }

  for (const row of existing ?? []) {
    const idx = row.installment_index ?? 0;
    if (idx <= 0 || idx <= n) continue;

    if (!payableRowIsMutable(row as PayableRow)) {
      lockedSkipped += 1;
      warnings.push(
        `Parcela ${idx} excedente (${row.status}) não removida — requer decisão manual.`
      );
      continue;
    }

    const { error } = await admin
      .from("accounts_payable")
      .delete()
      .eq("id", row.id)
      .eq("tenant_id", tenantId);

    if (error) {
      warnings.push(`Remover parcela ${idx}: ${error.message}`);
    } else {
      deleted += 1;
    }
  }

  return { updated, created, deleted, lockedSkipped, warnings };
}

/** @deprecated Use reconcilePayablesForPurchaseOrder — mantido como alias. */
export async function syncPayablesForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  order: PurchaseOrderForPayables,
  poStatus: string
): Promise<SyncPayablesResult> {
  return reconcilePayablesForPurchaseOrder(admin, tenantId, order, poStatus);
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
    if ((generate.created ?? 0) > 0) {
      return { generate };
    }
    const sync = await reconcilePayablesForPurchaseOrder(
      admin,
      tenantId,
      order,
      currentStatus
    );
    return { generate, sync };
  }

  if (shouldManagePayablesForStatus(previousStatus)) {
    const sync = await reconcilePayablesForPurchaseOrder(
      admin,
      tenantId,
      order,
      currentStatus
    );
    return { sync };
  }

  return {};
}

/** Sincroniza AP quando total, prazos ou data do pedido mudam (qualquer status). */
export async function ensurePayablesSyncedForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  order: PurchaseOrderForPayables,
  poStatus: string,
  changedFields: {
    total?: boolean;
    payment_installments?: boolean;
    payment_days_to_first_due?: boolean;
    payment_days_between_installments?: boolean;
    order_date?: boolean;
    supplier_id?: boolean;
  }
): Promise<SyncPayablesResult | undefined> {
  const shouldSync =
    changedFields.total ||
    changedFields.payment_installments ||
    changedFields.payment_days_to_first_due ||
    changedFields.payment_days_between_installments ||
    changedFields.order_date ||
    changedFields.supplier_id;

  if (!shouldSync) return undefined;
  if (shouldManagePayablesForStatus(poStatus)) return undefined;

  const { count, error } = await admin
    .from("accounts_payable")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", order.id);

  if (error || (count ?? 0) === 0) return undefined;

  return reconcilePayablesForPurchaseOrder(admin, tenantId, order, poStatus);
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
      "id, po_number, order_date, supplier_id, subtotal, discount, tax, total_ipi, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments, is_suggestion"
    )
    .eq("tenant_id", tenantId)
    .in("id", poIds);

  if (poErr || !orders?.length) {
    return { would_update, skipped };
  }

  const realOrders = (orders ?? []).filter((o) => o.is_suggestion !== true);
  const poById = new Map(realOrders.map((o) => [o.id, o]));

  const targetByPo = new Map<string, number[]>();
  for (const po of realOrders) {
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

/** Títulos provisórios → definitivos após recebimento do PC (status received). */
export async function confirmProvisionalPayablesForPurchaseOrder(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string
): Promise<{ updated: number }> {
  const { data, error } = await admin
    .from("accounts_payable")
    .update({ is_forecast: false })
    .eq("tenant_id", tenantId)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(error.message);
  return { updated: (data ?? []).length };
}
