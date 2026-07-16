import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  isInvoiceDocumentType,
  type InvoiceDocumentType,
} from "@/modules/core/types/sales-order-billing.types";

type Admin = SupabaseClient<Database>;

export async function setSalesOrderInvoiceDocumentType(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  documentType: InvoiceDocumentType
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  if (!isInvoiceDocumentType(documentType)) {
    return { ok: false, reasons: ["Tipo de documento inválido."] };
  }

  const db = asUntypedAdmin(admin);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = db.from("sales_orders") as any;

  const { data, error } = await orders
    .select("id, status, billing_closure, billing_plan")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reasons: ["Pedido não encontrado."] };

  const row = data as {
    id: string;
    status: string;
    billing_closure: string | null;
    billing_plan: string | null;
  };

  if (row.billing_closure) {
    return { ok: false, reasons: ["Pedido já finalizado no faturamento."] };
  }
  if (row.status === "cancelled") {
    return { ok: false, reasons: ["Pedido cancelado."] };
  }
  if (row.billing_plan === "without_invoice") {
    return {
      ok: false,
      reasons: ["Pedido marcado para entrega sem nota — remova o plano sem nota primeiro."],
    };
  }

  const { error: updErr } = await orders
    .update({
      invoice_document_type: documentType,
      billing_plan: "nfe",
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .is("billing_closure", null);

  if (updErr) throw new Error(updErr.message);
  return { ok: true };
}
