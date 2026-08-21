import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  applyPurchaseOrderReceive,
  type ReceivePurchaseOrderResult,
} from "@/modules/compras/lib/purchasing/purchase-order-receive";
import { effectivatePurchaseOrderPayables } from "@/modules/compras/lib/purchasing/purchase-payables";

type Admin = SupabaseClient<Database>;

export type FinalizePurchaseOrderReceiveOptions = {
  /**
   * Data da NF (quando há nota). Persistida como actual_delivery e usada
   * como data-base do vencimento. Sem NF → usa a data do recebimento físico.
   */
  invoiceIssueDate?: string;
  /** Alias aceite: mesma semântica que invoiceIssueDate (legado receive/NF). */
  actualDelivery?: string;
  /** Prazo real informado na conciliação da NF. */
  payment_days_to_first_due?: number;
  payment_days_between_installments?: number;
  payment_installments?: number;
};

export type FinalizePurchaseOrderReceiveResult = {
  order: Database["public"]["Tables"]["purchase_orders"]["Row"] | null;
  receive: ReceivePurchaseOrderResult;
  payablesConfirmed: number;
  payablesBaseDate: string;
};

function dayOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Handler único de recebimento de PC: estoque → grava data real → efectivar AP.
 * Ordem importa: actual_delivery (NF ou recebimento) fica persistida ANTES
 * de effectivatePurchaseOrderPayables calcular o vencimento.
 */
export async function finalizePurchaseOrderReceive(
  admin: Admin,
  tenantId: string,
  orderId: string,
  options?: FinalizePurchaseOrderReceiveOptions
): Promise<FinalizePurchaseOrderReceiveResult> {
  const receive = await applyPurchaseOrderReceive(admin, tenantId, orderId);

  const invoiceIssueDate =
    dayOnly(options?.invoiceIssueDate) ?? dayOnly(options?.actualDelivery);
  const materialEntryDate =
    invoiceIssueDate ?? new Date().toISOString().slice(0, 10);

  const paymentPatch: Database["public"]["Tables"]["purchase_orders"]["Update"] =
    {
      status: "received",
      actual_delivery: materialEntryDate,
    };

  if (options?.payment_days_to_first_due !== undefined) {
    paymentPatch.payment_days_to_first_due = options.payment_days_to_first_due;
  }
  if (options?.payment_days_between_installments !== undefined) {
    paymentPatch.payment_days_between_installments =
      options.payment_days_between_installments;
  }
  if (options?.payment_installments !== undefined) {
    paymentPatch.payment_installments = options.payment_installments;
  }

  const { data, error } = await admin
    .from("purchase_orders")
    .update(paymentPatch)
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Pedido não encontrado após recebimento.");

  const effectivated = await effectivatePurchaseOrderPayables(
    admin,
    tenantId,
    orderId,
    {
      invoiceIssueDate: invoiceIssueDate,
      payment_days_to_first_due: options?.payment_days_to_first_due,
      payment_days_between_installments:
        options?.payment_days_between_installments,
      payment_installments: options?.payment_installments,
    }
  );

  return {
    order: data,
    receive,
    payablesConfirmed: effectivated.confirmed,
    payablesBaseDate: effectivated.baseDate,
  };
}
