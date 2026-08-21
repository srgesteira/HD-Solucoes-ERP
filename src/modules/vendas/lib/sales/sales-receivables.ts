import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  splitAmountInInstallments,
} from "@/modules/vendas/lib/sales/sales-flow";
import { paymentScheduleBaseDate } from "@/modules/vendas/lib/sales/sales-order-delivery-schedule";
import { resolvePaymentDueDates } from "@/shared/utils/payment-due";

type Admin = SupabaseClient<Database>;

export const RECEIVABLE_SOURCE_SALES_ORDER = "sales_order";

export type SalesOrderForReceivables = {
  id: string;
  order_number: string;
  order_date: string;
  /** Base dos vencimentos (entrega prevista/real). */
  payment_base_date: string;
  total: number;
  client_name: string;
  client_document: string | null;
  payment_installments: number;
  payment_days_to_first_due: number;
  payment_days_between_installments: number;
  payment_due_mode?: string | null;
  payment_fixed_due_dates?: string[] | null;
};

export type SyncReceivablesResult = {
  updated: number;
  lockedSkipped: number;
  warnings: string[];
};

export function buildSalesOrderReceivableTargets(order: SalesOrderForReceivables): {
  amounts: number[];
  dueDates: string[];
  documentNumbers: string[];
  descriptions: string[];
} {
  const total = Number(order.total ?? 0);
  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const amounts = splitAmountInInstallments(total, n);
  const dueDates = resolvePaymentDueDates(
    {
      payment_due_mode: order.payment_due_mode,
      payment_fixed_due_dates: order.payment_fixed_due_dates,
      payment_installments: n,
      payment_days_to_first_due: order.payment_days_to_first_due ?? 30,
      payment_days_between_installments:
        order.payment_days_between_installments ?? 0,
    },
    order.payment_base_date
  );
  const documentNumbers: string[] = [];
  const descriptions: string[] = [];

  for (let i = 0; i < n; i++) {
    documentNumbers.push(`${order.order_number}-${i + 1}/${n}`);
    descriptions.push(`Parcela ${i + 1}/${n} — pedido ${order.order_number}`);
  }

  return { amounts, dueDates, documentNumbers, descriptions };
}

/**
 * Recalcula parcelas pendentes sem baixa parcial (paid_amount = 0).
 * Não altera títulos pagos, parciais, cancelados ou com is_forecast já resolvido fora de pending.
 */
export async function syncReceivablesForSalesOrder(
  admin: Admin,
  tenantId: string,
  order: SalesOrderForReceivables
): Promise<SyncReceivablesResult> {
  const warnings: string[] = [];
  const total = Number(order.total ?? 0);
  if (total <= 0) {
    return { updated: 0, lockedSkipped: 0, warnings };
  }

  const targets = buildSalesOrderReceivableTargets(order);

  const { data: existing, error: loadErr } = await admin
    .from("receivables")
    .select(
      "id, installment_index, original_amount, current_amount, paid_amount, status, due_date, is_forecast"
    )
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", order.id)
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
    const newAmt = targets.amounts[idx];
    const newDue = targets.dueDates[idx];
    const newDoc = targets.documentNumbers[idx];
    const newDesc = targets.descriptions[idx];
    if (newAmt === undefined || !newDue) continue;

    const orig = Number(row.original_amount ?? 0);
    const cur = Number(row.current_amount ?? 0);
    const paid = Number(row.paid_amount ?? 0);
    const hasPayment = paid > 0.001 || Math.abs(cur - orig) > 0.001;

    if (row.status !== "pending" || hasPayment) {
      lockedSkipped += 1;
      if (
        Math.abs(newAmt - orig) > 0.001 ||
        (row.due_date && newDue !== String(row.due_date).slice(0, 10))
      ) {
        warnings.push(
          `Parcela ${row.installment_index ?? "?"} (${row.status}) não recalculada — requer decisão manual.`
        );
      }
      continue;
    }

    const dueChanged =
      row.due_date && newDue !== String(row.due_date).slice(0, 10);
    const amtChanged = Math.abs(newAmt - orig) > 0.001;

    if (!amtChanged && !dueChanged) continue;

    const patch: Database["public"]["Tables"]["receivables"]["Update"] = {};
    if (amtChanged) {
      patch.original_amount = newAmt;
      patch.current_amount = newAmt;
    }
    if (dueChanged) patch.due_date = newDue;
    if (newDoc) patch.document_number = newDoc;
    if (newDesc) patch.description = newDesc;

    const { error } = await admin
      .from("receivables")
      .update(patch)
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

export function salesOrderRowToReceivablesInput(row: {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery?: string | null;
  actual_delivery?: string | null;
  total: number | null;
  client_name: string;
  client_document: string | null;
  payment_installments: number | null;
  payment_days_to_first_due: number | null;
  payment_days_between_installments: number | null;
  payment_due_mode?: string | null;
  payment_fixed_due_dates?: string[] | null;
  /** Se definido, usa como data de emissão da NF (não a entrega). */
  payment_base_date?: string | null;
}): SalesOrderForReceivables {
  return {
    id: row.id,
    order_number: row.order_number,
    order_date: row.order_date,
    payment_base_date:
      row.payment_base_date?.slice(0, 10) ||
      paymentScheduleBaseDate({
        actual_delivery: row.actual_delivery,
        expected_delivery: row.expected_delivery,
        order_date: row.order_date,
      }),
    total: Number(row.total ?? 0),
    client_name: row.client_name,
    client_document: row.client_document,
    payment_installments: row.payment_installments ?? 1,
    payment_days_to_first_due: row.payment_days_to_first_due ?? 30,
    payment_days_between_installments:
      row.payment_days_between_installments ?? 0,
    payment_due_mode: row.payment_due_mode ?? "from_emission",
    payment_fixed_due_dates: row.payment_fixed_due_dates ?? [],
  };
}

/** Sincroniza recebíveis quando total, prazos ou datas de entrega mudam no PV. */
export async function ensureReceivablesSyncedForSalesOrder(
  admin: Admin,
  tenantId: string,
  order: SalesOrderForReceivables,
  changedFields: {
    total?: boolean;
    payment_installments?: boolean;
    payment_days_to_first_due?: boolean;
    payment_days_between_installments?: boolean;
    payment_due_mode?: boolean;
    payment_fixed_due_dates?: boolean;
    order_date?: boolean;
    expected_delivery?: boolean;
    actual_delivery?: boolean;
  }
): Promise<SyncReceivablesResult | undefined> {
  const shouldSync =
    changedFields.total ||
    changedFields.payment_installments ||
    changedFields.payment_days_to_first_due ||
    changedFields.payment_days_between_installments ||
    changedFields.payment_due_mode ||
    changedFields.payment_fixed_due_dates ||
    changedFields.order_date ||
    changedFields.expected_delivery ||
    changedFields.actual_delivery;

  if (!shouldSync) return undefined;
  return syncReceivablesForSalesOrder(admin, tenantId, order);
}

/** Títulos provisórios → definitivos (só flag). Preferir `effectivateSalesOrderReceivables`. */
export async function confirmProvisionalReceivablesForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<{ updated: number }> {
  const { data, error } = await admin
    .from("receivables")
    .update({ is_forecast: false })
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(error.message);
  return { updated: (data ?? []).length };
}

function dayOnlyIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export type EffectivateSalesOrderReceivablesOptions = {
  /** Data de faturamento / entrega real (data-base do vencimento). */
  billingOrDeliveryDate?: string | null;
  payment_days_to_first_due?: number;
  payment_days_between_installments?: number;
  payment_installments?: number;
};

export type EffectivateSalesOrderReceivablesResult = {
  baseDate: string;
  sync: SyncReceivablesResult;
  confirmed: number;
};

/**
 * Único caminho permitido previsão → real para CR de venda.
 * Pré-requisito: actual_delivery (ou billingOrDeliveryDate) disponível.
 * Vencimento = data de emissão da NF-e + prazo, ou datas fixas do plano.
 */
export async function effectivateSalesOrderReceivables(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  options?: EffectivateSalesOrderReceivablesOptions
): Promise<EffectivateSalesOrderReceivablesResult> {
  const { data: so, error } = await admin
    .from("sales_orders")
    .select(
      "id, order_number, order_date, expected_delivery, actual_delivery, total, client_name, client_document, payment_installments, payment_days_to_first_due, payment_days_between_installments, payment_due_mode, payment_fixed_due_dates"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!so) {
    throw new Error("Pedido de venda não encontrado para efectivar recebíveis.");
  }

  const baseDate =
    dayOnlyIso(options?.billingOrDeliveryDate) ??
    dayOnlyIso(so.actual_delivery);

  if (!baseDate) {
    throw new Error(
      "Sem data real de entrega/faturamento para efectivar recebíveis."
    );
  }

  const order = salesOrderRowToReceivablesInput({
    ...so,
    actual_delivery: baseDate,
    payment_installments:
      options?.payment_installments ?? so.payment_installments,
    payment_days_to_first_due:
      options?.payment_days_to_first_due ?? so.payment_days_to_first_due,
    payment_days_between_installments:
      options?.payment_days_between_installments ??
      so.payment_days_between_installments,
  });

  const sync = await syncReceivablesForSalesOrder(admin, tenantId, order);
  const confirmed = await confirmProvisionalReceivablesForSalesOrder(
    admin,
    tenantId,
    salesOrderId
  );

  return { baseDate, sync, confirmed: confirmed.updated };
}
