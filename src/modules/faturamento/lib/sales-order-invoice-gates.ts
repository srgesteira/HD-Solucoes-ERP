import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  isFiscalReadyForInvoice,
  type FiscalStatus,
} from "@/modules/fiscal/lib/fiscal-rules-types";

type Admin = SupabaseClient<Database>;

export type InvoiceGateResult = {
  ok: boolean;
  reasons: string[];
};

function fiscalStatusOf(raw: string | null | undefined): FiscalStatus {
  const s = raw ?? "pending";
  if (
    s === "no_rules" ||
    s === "rules_applied" ||
    s === "manual_override" ||
    s === "review_required" ||
    s === "approved" ||
    s === "pending"
  ) {
    return s;
  }
  return "pending";
}

/** Valida se o pedido pode emitir NFS-e (produção + fiscal + crédito). */
export async function validateSalesOrderCanEmitNfe(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<InvoiceGateResult> {
  const reasons: string[] = [];

  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .select("id, status, ready_for_invoice, fiscal_status")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (soErr) throw new Error(soErr.message);
  if (!so) {
    return { ok: false, reasons: ["Pedido não encontrado."] };
  }

  if (so.status !== "confirmed") {
    reasons.push('Pedido deve estar "Confirmado".');
  }

  const fiscal = fiscalStatusOf(so.fiscal_status);
  if (!so.ready_for_invoice) {
    reasons.push("Produção ainda não liberou o pedido para faturamento.");
  }
  if (!isFiscalReadyForInvoice(so.ready_for_invoice === true, fiscal)) {
    reasons.push(
      `Conferência fiscal pendente (estado: ${fiscal}).`
    );
  }

  const { data: credit } = await admin
    .from("credit_analysis")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("sales_order_ref", salesOrderId)
    .maybeSingle();

  if (credit?.status === "pending") {
    reasons.push("Análise de crédito pendente.");
  }
  if (credit?.status === "rejected") {
    reasons.push("Análise de crédito rejeitada.");
  }

  const { data: blocking } = await admin
    .from("nfes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .in("status", ["pending", "processing", "authorized"]);
  if (blocking?.length) {
    reasons.push("Já existe NFS-e em curso ou autorizada.");
  }

  return { ok: reasons.length === 0, reasons };
}
