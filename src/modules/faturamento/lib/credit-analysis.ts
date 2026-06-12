import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { publishEvent } from "@/shared/events/publish";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { confirmProvisionalReceivablesForSalesOrder } from "@/modules/vendas/lib/sales/sales-receivables";

type Admin = SupabaseClient<Database>;

export type CreditAnalysisRow = {
  id: string;
  tenant_id: string;
  sales_order_ref: string;
  sales_order_number: string;
  customer_id: string;
  customer_name: string;
  order_total: number;
  customer_credit_limit: number | null;
  customer_open_balance: number;
  customer_overdue_balance: number;
  customer_score: string | null;
  status: string;
  approved_amount: number | null;
  rejection_reason: string | null;
  observations: string | null;
  analyzed_by: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function approveCreditAnalysis(
  admin: Admin,
  tenantId: string,
  analysisId: string,
  userId: string,
  approvedAmount?: number
): Promise<CreditAnalysisRow> {
  const db = asUntypedAdmin(admin);
  const { data: row, error: fetchErr } = await db
    .from("credit_analysis")
    .select("*")
    .eq("id", analysisId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error("Análise não encontrada");
  if (row.status !== "pending" && row.status !== "partial") {
    throw new Error("Análise já foi decidida");
  }

  const amount =
    approvedAmount != null && Number.isFinite(approvedAmount)
      ? approvedAmount
      : Number(row.order_total);
  const status =
    amount < Number(row.order_total) - 0.009 ? "partial" : "approved";

  const { data: updated, error } = await db
    .from("credit_analysis")
    .update({
      status,
      approved_amount: amount,
      analyzed_by: userId,
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  try {
    await confirmProvisionalReceivablesForSalesOrder(
      admin,
      tenantId,
      String(row.sales_order_ref)
    );
  } catch (recvErr) {
    console.warn(
      "[credit-analysis] Falha ao confirmar recebíveis provisórios:",
      recvErr instanceof Error ? recvErr.message : recvErr
    );
  }

  await publishEvent(
    admin,
    "faturamento.credit.approved",
    {
      sales_order_ref: row.sales_order_ref,
      order_number: row.sales_order_number,
      tenant_id: tenantId,
      approved_amount: amount,
    },
    tenantId,
    `credit-approved:${row.sales_order_ref}`
  );

  return updated as CreditAnalysisRow;
}

export async function rejectCreditAnalysis(
  admin: Admin,
  tenantId: string,
  analysisId: string,
  userId: string,
  rejectionReason: string
): Promise<CreditAnalysisRow> {
  const reason = rejectionReason.trim();
  if (!reason) throw new Error("Motivo da rejeição é obrigatório");

  const db = asUntypedAdmin(admin);
  const { data: row, error: fetchErr } = await db
    .from("credit_analysis")
    .select("*")
    .eq("id", analysisId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error("Análise não encontrada");

  const { data: updated, error } = await db
    .from("credit_analysis")
    .update({
      status: "rejected",
      rejection_reason: reason,
      analyzed_by: userId,
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await admin
    .from("sales_orders")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", row.sales_order_ref)
    .eq("tenant_id", tenantId);

  await publishEvent(
    admin,
    "faturamento.credit.rejected",
    {
      sales_order_ref: row.sales_order_ref,
      order_number: row.sales_order_number,
      tenant_id: tenantId,
      rejection_reason: reason,
    },
    tenantId,
    `credit-rejected:${row.sales_order_ref}`
  );

  return updated as CreditAnalysisRow;
}
