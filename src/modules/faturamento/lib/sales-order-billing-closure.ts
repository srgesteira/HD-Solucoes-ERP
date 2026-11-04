import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import {
  confirmProvisionalReceivablesForSalesOrder,
  salesOrderRowToReceivablesInput,
  syncReceivablesForSalesOrder,
} from "@/modules/vendas/lib/sales/sales-receivables";
import { notifyCustomerNfeAuthorized } from "@/modules/fiscal/lib/bling/send-nfe-status-email";
import { todayIsoSaoPaulo } from "@/shared/utils/date";
import { loadNfeGroupForSalesOrder } from "@/modules/faturamento/lib/nfe-invoice-group";
import type { SalesOrderForReceivables } from "@/modules/vendas/lib/sales/sales-receivables";
import {
  paymentTotalWithFreight,
  resolveInstallmentAmounts,
  roundInstallmentMoney,
} from "@/shared/utils/payment-installment-amounts";
import { normalizeIsoDate, resolvePaymentDueDates } from "@/shared/utils/payment-due";

type Admin = SupabaseClient<Database>;

export type BillingClosure = "nfe" | "without_invoice";

type SalesOrderBillingRow = {
  id: string;
  status: string;
  billing_closure: string | null;
  billing_plan: string | null;
  ready_for_invoice: boolean;
  actual_delivery: string | null;
};

export type CloseSalesOrderBillingOptions = {
  skipEmitGate?: boolean;
  /**
   * Data real de entrega (yyyy-mm-dd). Só usada se o pedido ainda não tiver
   * `actual_delivery`; sem nenhuma das duas, usa hoje (São Paulo).
   */
  actualDelivery?: string | null;
  /** Calendário explícito dos recebíveis (ex.: fatia do PV numa NF-e agrupada). */
  receivablesSchedule?: SalesOrderForReceivables["schedule_override"];
};

/** Marca intenção de entrega sem NF-e (aba Fiscal pendente → Aguardando liberação). */
export async function planSalesOrderWithoutInvoice(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("sales_orders")
    .select("id, status, billing_closure, billing_plan")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const so = data as Pick<
    SalesOrderBillingRow,
    "id" | "status" | "billing_closure" | "billing_plan"
  > | null;

  if (!so) return { ok: false, reasons: ["Pedido não encontrado."] };
  if (so.billing_closure) {
    return { ok: false, reasons: ["Pedido já finalizado no faturamento."] };
  }
  if (so.status === "cancelled") {
    return { ok: false, reasons: ["Pedido cancelado."] };
  }
  if (so.billing_plan === "without_invoice") {
    return { ok: true };
  }
  if (so.billing_plan === "nfe") {
    return {
      ok: false,
      reasons: ["Pedido já está marcado para emissão de NF-e."],
    };
  }

  const { data: blocking } = await admin
    .from("nfes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .in("status", ["pending", "processing", "authorized"])
    .limit(1);
  if (blocking?.length) {
    return {
      ok: false,
      reasons: ["Já existe NFS-e em curso ou autorizada para este pedido."],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersTable = db.from("sales_orders") as any;
  const { error: updErr } = await ordersTable
    .update({ billing_plan: "without_invoice" })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .is("billing_closure", null);

  if (updErr) throw new Error(updErr.message);
  return { ok: true };
}

export async function closeSalesOrderBilling(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  closure: BillingClosure,
  options?: CloseSalesOrderBillingOptions
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const requestedDelivery =
    options?.actualDelivery != null && options.actualDelivery !== ""
      ? normalizeIsoDate(options.actualDelivery)
      : null;
  if (options?.actualDelivery && !requestedDelivery) {
    return { ok: false, reasons: ["Data real de entrega inválida."] };
  }
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("sales_orders")
    .select(
      "id, status, billing_closure, billing_plan, ready_for_invoice, actual_delivery"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const so = data as SalesOrderBillingRow | null;
  if (!so) return { ok: false, reasons: ["Pedido não encontrado."] };
  if (so.billing_closure) {
    return { ok: false, reasons: ["Pedido já foi finalizado no faturamento."] };
  }
  if (so.status === "cancelled") {
    return { ok: false, reasons: ["Pedido cancelado."] };
  }

  if (closure === "without_invoice") {
    if (so.billing_plan !== "without_invoice") {
      return {
        ok: false,
        reasons: [
          "Marque o pedido como «Sem nota» na aba Fiscal pendente antes de concluir.",
        ],
      };
    }
    // Entrega «sem nota»: não exige regras/ICMS — basta o plano e a liberação PCP.
    if (!so.ready_for_invoice) {
      return {
        ok: false,
        reasons: ["Produção ainda não liberou o pedido para faturamento."],
      };
    }
    if (
      !["confirmed", "in_production", "shipped", "delivered"].includes(so.status)
    ) {
      return {
        ok: false,
        reasons: ["Pedido não está num estado válido para fechar o faturamento."],
      };
    }
    const { data: credit } = await admin
      .from("credit_analysis")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("sales_order_ref", salesOrderId)
      .maybeSingle();
    if (credit?.status === "pending") {
      return { ok: false, reasons: ["Análise de crédito pendente."] };
    }
    if (credit?.status === "rejected") {
      return { ok: false, reasons: ["Análise de crédito rejeitada."] };
    }
    const { data: blocking } = await admin
      .from("nfes")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("sales_order_id", salesOrderId)
      .in("status", ["pending", "processing", "authorized"])
      .limit(1);
    if (blocking?.length) {
      return {
        ok: false,
        reasons: ["Já existe NFS-e em curso ou autorizada para este pedido."],
      };
    }
  } else if (!options?.skipEmitGate) {
    const gate = await validateSalesOrderCanEmitNfe(admin, tenantId, salesOrderId);
    if (!gate.ok) {
      return { ok: false, reasons: gate.reasons };
    }
  }

  // Nunca sobrescrever a entrega real já registada (pedidos antigos).
  const existingDelivery = normalizeIsoDate(so.actual_delivery);
  const actualDelivery =
    existingDelivery ?? requestedDelivery ?? todayIsoSaoPaulo();
  const materialReady = so.ready_for_invoice === true;
  const markDelivered = closure === "without_invoice" || materialReady;

  // billing_closure: coluna pós-migração — regenerar database.ts quando possível
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersTable = db.from("sales_orders") as any;
  const { error: updErr } = await ordersTable
    .update({
      billing_closure: closure,
      billing_plan: closure,
      ...(markDelivered
        ? {
            status: "delivered",
            ...(existingDelivery ? {} : { actual_delivery: actualDelivery }),
          }
        : {}),
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .is("billing_closure", null);

  if (updErr) throw new Error(updErr.message);

  try {
    const { data: fresh } = await asUntypedAdmin(admin)
      .from("sales_orders")
      .select(
        "id, order_number, order_date, expected_delivery, actual_delivery, total, freight_cost, client_name, client_document, payment_installments, payment_days_to_first_due, payment_days_between_installments, payment_due_mode, payment_fixed_due_dates, payment_installment_amounts, invoice_document_type"
      )
      .eq("id", salesOrderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (fresh) {
      const docType = (fresh as { invoice_document_type?: string | null })
        .invoice_document_type;
      if (docType !== "nfe_remessa") {
        // Base dos vencimentos: sem nota → entrega real; NF-e → emissão (hoje,
        // como nas duplicatas enviadas ao Bling).
        const paymentBaseDate =
          closure === "without_invoice"
            ? normalizeIsoDate(fresh.actual_delivery) ?? actualDelivery
            : todayIsoSaoPaulo();
        const recvInput = salesOrderRowToReceivablesInput({
            id: fresh.id,
            order_number: fresh.order_number,
            order_date: fresh.order_date,
            expected_delivery: fresh.expected_delivery,
            actual_delivery: fresh.actual_delivery ?? actualDelivery,
            total: fresh.total,
            client_name: fresh.client_name,
            client_document: fresh.client_document,
            payment_installments: fresh.payment_installments,
            payment_days_to_first_due: fresh.payment_days_to_first_due,
            payment_days_between_installments:
              fresh.payment_days_between_installments,
            payment_due_mode: (
              fresh as { payment_due_mode?: string | null }
            ).payment_due_mode,
            payment_fixed_due_dates: (
              fresh as { payment_fixed_due_dates?: string[] | null }
            ).payment_fixed_due_dates,
            payment_installment_amounts: (
              fresh as { payment_installment_amounts?: number[] | null }
            ).payment_installment_amounts,
            freight_cost: (fresh as { freight_cost?: number | null }).freight_cost,
            invoice_document_type: docType,
            payment_base_date: paymentBaseDate,
          });
        const sync = await syncReceivablesForSalesOrder(
          admin,
          tenantId,
          {
            ...recvInput,
            schedule_override: options?.receivablesSchedule ?? null,
          },
          { createIfNone: true }
        );
        if (sync.warnings.length) {
          console.warn(
            "[billing-closure] Avisos ao sincronizar recebíveis:",
            salesOrderId,
            sync.warnings
          );
        }
        await confirmProvisionalReceivablesForSalesOrder(
          admin,
          tenantId,
          salesOrderId
        );
      }
    }
  } catch (recvErr) {
    console.warn(
      "[billing-closure] Falha ao efectivar previsão financeira:",
      salesOrderId,
      recvErr instanceof Error ? recvErr.message : recvErr
    );
  }

  return { ok: true };
}

/** Fecha o pedido quando a NFS-e é autorizada (idempotente). */
export async function maybeCloseSalesOrderOnNfeAuthorized(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<void> {
  const { data: nfe, error } = await admin
    .from("nfes")
    .select("id, sales_order_id, status, nfe_number")
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!nfe?.sales_order_id || nfe.status !== "authorized") return;

  await notifyCustomerNfeAuthorized(admin, tenantId, nfeId);

  const group = await loadNfeGroupForSalesOrder(
    admin,
    tenantId,
    nfe.sales_order_id
  );
  const orderIds = group?.members.length
    ? group.members.map((m) => m.id)
    : [nfe.sales_order_id];

  // NF-e agrupada: as duplicatas saem com o prazo do PV primário sobre o total
  // somado. Cada PV recebe a sua fatia de cada duplicata (mesmas datas), para
  // que todas as parcelas da nota virem contas a receber.
  let schedules: Map<string, GroupedReceivablesSchedule> | null = null;
  if (group && group.members.length > 1) {
    try {
      schedules = await buildGroupedNfeReceivableSchedules(
        admin,
        tenantId,
        group.primary_sales_order_id,
        orderIds,
        (nfe as { nfe_number?: string | null }).nfe_number ?? null
      );
    } catch (schedErr) {
      console.warn(
        "[billing-closure] Falha ao montar parcelas da NF-e agrupada:",
        nfeId,
        schedErr instanceof Error ? schedErr.message : schedErr
      );
    }
  }

  for (const orderId of orderIds) {
    const result = await closeSalesOrderBilling(admin, tenantId, orderId, "nfe", {
      skipEmitGate: true,
      receivablesSchedule: schedules?.get(orderId) ?? null,
    });
    if (!result.ok) {
      console.warn(
        "[billing-closure] NF-e autorizada mas pedido não fechou:",
        orderId,
        result.reasons
      );
    }
  }
}

type GroupedReceivablesSchedule = NonNullable<
  SalesOrderForReceivables["schedule_override"]
>;

type GroupOrderPaymentRow = {
  id: string;
  order_number: string;
  total: number | null;
  freight_cost: number | null;
  payment_installments: number | null;
  payment_days_to_first_due: number | null;
  payment_days_between_installments: number | null;
  payment_due_mode: string | null;
  payment_fixed_due_dates: string[] | null;
  payment_installment_amounts: number[] | null;
};

/**
 * Reparte as duplicatas de uma NF-e agrupada pelos PVs do grupo.
 * Duplicatas = prazo/valores do PV primário sobre a soma (mercadoria + frete)
 * de todos os PVs, vencimentos a partir de hoje (mesma regra de
 * `buildBlingNfeParcelas`). Cada PV fica com N parcelas (N = duplicatas), na
 * proporção do seu total; a soma por data = valor da duplicata e a soma por
 * PV = total do PV.
 */
export async function buildGroupedNfeReceivableSchedules(
  admin: Admin,
  tenantId: string,
  primaryOrderId: string,
  orderIds: string[],
  nfeNumber: string | null,
  emissionDateIso: string = todayIsoSaoPaulo()
): Promise<Map<string, GroupedReceivablesSchedule>> {
  const out = new Map<string, GroupedReceivablesSchedule>();
  const { data, error } = await asUntypedAdmin(admin)
    .from("sales_orders")
    .select(
      "id, order_number, total, freight_cost, payment_installments, payment_days_to_first_due, payment_days_between_installments, payment_due_mode, payment_fixed_due_dates, payment_installment_amounts"
    )
    .eq("tenant_id", tenantId)
    .in("id", orderIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GroupOrderPaymentRow[];
  const primary = rows.find((r) => r.id === primaryOrderId);
  if (!primary) return out;

  const ordered = [
    primary,
    ...orderIds
      .filter((id) => id !== primaryOrderId)
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is GroupOrderPaymentRow => Boolean(r)),
  ];
  const memberTotals = ordered.map((r) =>
    paymentTotalWithFreight(Number(r.total ?? 0), r.freight_cost)
  );
  const grandTotal = roundInstallmentMoney(
    memberTotals.reduce((s, v) => s + v, 0)
  );
  if (grandTotal <= 0) return out;

  return computeGroupedNfeSchedules({
    primary,
    ordered,
    memberTotals,
    grandTotal,
    nfeNumber,
    emissionDateIso,
  });
}

function computeGroupedNfeSchedules(input: {
  primary: GroupOrderPaymentRow;
  ordered: GroupOrderPaymentRow[];
  memberTotals: number[];
  grandTotal: number;
  nfeNumber: string | null;
  emissionDateIso: string;
}): Map<string, GroupedReceivablesSchedule> {
  const { primary, ordered, memberTotals, grandTotal } = input;
  const out = new Map<string, GroupedReceivablesSchedule>();
  const n = Math.max(
    1,
    Math.min(999, Math.floor(Number(primary.payment_installments)) || 1)
  );
  const dupAmounts = resolveInstallmentAmounts(
    grandTotal,
    n,
    primary.payment_installment_amounts
  );
  const dueDates = resolvePaymentDueDates(
    {
      payment_due_mode: primary.payment_due_mode,
      payment_fixed_due_dates: primary.payment_fixed_due_dates,
      payment_installments: n,
      payment_days_to_first_due: primary.payment_days_to_first_due ?? 30,
      payment_days_between_installments:
        primary.payment_days_between_installments ?? 0,
    },
    input.emissionDateIso
  );
  const cents = (v: number) => Math.round(v * 100);
  const dupCents = dupAmounts.map(cents);
  const allocated = dupCents.map(() => 0);
  const nfLabel = input.nfeNumber?.trim()
    ? `NF-e ${input.nfeNumber.trim()}`
    : "NF-e agrupada";

  ordered.forEach((row, m) => {
    const isLast = m === ordered.length - 1;
    const memberCents = cents(memberTotals[m]);
    const parts: number[] = [];
    if (isLast) {
      // Último PV fica com o resto de cada duplicata (soma por data exacta).
      for (let i = 0; i < n; i++) parts.push(dupCents[i] - allocated[i]);
    } else {
      const share = grandTotal > 0 ? memberTotals[m] / grandTotal : 0;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const v =
          i === n - 1 ? memberCents - acc : Math.round(dupCents[i] * share);
        parts.push(v);
        acc += v;
      }
    }
    parts.forEach((v, i) => {
      allocated[i] += v;
    });
    out.set(row.id, {
      amounts: parts.map((v) => Math.max(0, v) / 100),
      dueDates,
      descriptions: parts.map(
        (_, i) =>
          `Parcela ${i + 1}/${n} — pedido ${row.order_number} (${nfLabel}, duplicata ${String(i + 1).padStart(3, "0")})`
      ),
    });
  });
  return out;
}
