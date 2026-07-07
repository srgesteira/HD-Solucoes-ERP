import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import { isFiscalConfigured } from "@/modules/fiscal/lib/fiscal-rules-types";

type Admin = SupabaseClient<Database>;

export type BillingClosure = "nfe" | "without_invoice";

type SalesOrderBillingRow = {
  id: string;
  status: string;
  billing_closure: string | null;
  ready_for_invoice: boolean;
  fiscal_status: string | null;
};

export async function closeSalesOrderBilling(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  closure: BillingClosure,
  options?: { skipEmitGate?: boolean }
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("sales_orders")
    .select("id, status, billing_closure, ready_for_invoice, fiscal_status")
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

  if (!options?.skipEmitGate) {
    const gate = await validateSalesOrderCanEmitNfe(admin, tenantId, salesOrderId);
    if (!gate.ok) {
      return { ok: false, reasons: gate.reasons };
    }
  } else if (closure === "without_invoice") {
    const fiscal = so.fiscal_status ?? "pending";
    if (!isFiscalConfigured(fiscal)) {
      return {
        ok: false,
        reasons: ["Conferência fiscal pendente — configure impostos antes de fechar."],
      };
    }
    if (!so.ready_for_invoice) {
      return {
        ok: false,
        reasons: ["Produção ainda não liberou o pedido para faturamento."],
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
  }

  // billing_closure: coluna pós-migração — regenerar database.ts quando possível
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersTable = db.from("sales_orders") as any;
  const { error: updErr } = await ordersTable
    .update({
      billing_closure: closure,
      status: "delivered",
      actual_delivery: new Date().toISOString().slice(0, 10),
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .is("billing_closure", null);

  if (updErr) throw new Error(updErr.message);
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
    .select("id, sales_order_id, status")
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!nfe?.sales_order_id || nfe.status !== "authorized") return;

  const result = await closeSalesOrderBilling(
    admin,
    tenantId,
    nfe.sales_order_id,
    "nfe",
    { skipEmitGate: true }
  );
  if (!result.ok) {
    console.warn(
      "[billing-closure] NF-e autorizada mas pedido não fechou:",
      nfe.sales_order_id,
      result.reasons
    );
  }
}
