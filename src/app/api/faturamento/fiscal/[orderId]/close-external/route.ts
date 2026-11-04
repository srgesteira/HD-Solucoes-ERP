import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

const DOC_TYPES = new Set([
  "nfse",
  "nfe_product",
  "nfe_industrialization",
  "nfe_remessa",
]);

/**
 * Fecha o ciclo de faturamento de um pedido cuja nota foi emitida FORA do ERP
 * (NFS-e nacional, nota de parceiro, etc.).
 *
 * Diferente de close-without-invoice: NÃO altera status, datas de entrega
 * nem parcelas a receber — só registra o fechamento e a conferência fiscal.
 *
 * body: { closure: "nfe" | "without_invoice", invoice_document_type?, note }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem fechar o faturamento.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const closure = String(body.closure ?? "");
  if (closure !== "nfe" && closure !== "without_invoice") {
    return apiError("closure deve ser 'nfe' ou 'without_invoice'.", 400);
  }
  const note = String(body.note ?? "").trim();
  if (!note) {
    return apiError("Informe a observação (qual nota / quem emitiu).", 400);
  }
  const docType =
    body.invoice_document_type == null
      ? null
      : String(body.invoice_document_type);
  if (docType && !DOC_TYPES.has(docType)) {
    return apiError("Tipo de nota inválido.", 400);
  }

  const db = asUntypedAdmin(createSupabaseAdminClient());
  const { data: so, error } = await db
    .from("sales_orders")
    .select("id, status, billing_closure, notes, invoice_document_type")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return apiError(error.message, 400);
  const row = so as {
    id: string;
    status: string;
    billing_closure: string | null;
    notes: string | null;
    invoice_document_type: string | null;
  } | null;
  if (!row) return apiError("Pedido não encontrado.", 404);
  if (row.billing_closure) {
    return apiError("Pedido já foi finalizado no faturamento.", 400);
  }
  if (row.status === "cancelled") return apiError("Pedido cancelado.", 400);

  const stamp = new Date().toISOString().slice(0, 10);
  const notes = [row.notes?.trim(), `[${stamp}] Faturamento fechado fora do ERP: ${note}`]
    .filter(Boolean)
    .join("\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersTable = db.from("sales_orders") as any;
  const { data: updated, error: updErr } = await ordersTable
    .update({
      billing_closure: closure,
      billing_plan: closure,
      fiscal_status: "manual_override",
      invoice_document_type: docType ?? row.invoice_document_type,
      notes,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .is("billing_closure", null)
    .select("*")
    .maybeSingle();
  if (updErr) return apiError(updErr.message, 400);

  return apiOk({ data: updated });
}
