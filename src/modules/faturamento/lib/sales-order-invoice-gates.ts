import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
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
  const db = asUntypedAdmin(admin);

  const { data: soRaw, error: soErr } = await db
    .from("sales_orders")
    .select(
      "id, status, ready_for_invoice, fiscal_status, billing_closure, billing_plan"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (soErr) throw new Error(soErr.message);
  const so = soRaw as {
    id: string;
    status: string;
    ready_for_invoice: boolean;
    fiscal_status: string | null;
    billing_closure: string | null;
    billing_plan: string | null;
  } | null;
  if (!so) {
    return { ok: false, reasons: ["Pedido não encontrado."] };
  }

  if (so.billing_closure) {
    reasons.push("Pedido já finalizado no faturamento.");
  }

  if (so.billing_plan === "without_invoice") {
    reasons.push("Pedido marcado para entrega sem NF-e.");
  }

  const emitOkStatuses = new Set([
    "confirmed",
    "in_production",
    "shipped",
    "delivered",
  ]);
  if (!emitOkStatuses.has(so.status)) {
    reasons.push(
      'Pedido deve estar confirmado, em produção, expedido ou entregue.'
    );
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
