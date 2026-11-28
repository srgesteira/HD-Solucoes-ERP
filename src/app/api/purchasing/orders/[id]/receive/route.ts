import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { finalizePurchaseOrderReceive } from "@/modules/compras/lib/purchasing/purchase-order-receive-finalize";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Recalcula custos (rateio de extras) e marca o pedido como recebido. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("purchase_orders")
    .select(
      "id, status, po_number, order_date, expected_delivery, actual_delivery, supplier_id, is_suggestion, subtotal, discount, tax, total_icms, total_ipi, total_tax_base, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments, payment_installment_amounts"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .maybeSingle();

  if (fetchErr) {
    return apiError(
      "Erro ao validar pedido: " + fetchErr.message,
      supabaseErrorToHttp(fetchErr.code)
    );
  }
  if (!existing) return apiError("Pedido não encontrado", 404);

  if (existing.status === "received") {
    return apiError("Pedido já foi recebido.", 409);
  }
  if (existing.status === "cancelled") {
    return apiError("Pedido cancelado não pode ser recebido.", 400);
  }

  // Norma v1.2 item 4: chegada física opcional no corpo { data_chegada_fisica: "AAAA-MM-DD" } (≠ data de registro).
  let chegada: string | null = null;
  try {
    const b = (await request.json().catch(() => null)) as { data_chegada_fisica?: unknown } | null;
    if (b?.data_chegada_fisica) {
      const d = String(b.data_chegada_fisica).slice(0, 10);
      const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > hoje || d < String(existing.order_date ?? "")) {
        return apiError("data_chegada_fisica inválida (AAAA-MM-DD, entre o pedido e hoje)", 400);
      }
      chegada = d;
    }
  } catch { /* corpo vazio: segue sem chegada física */ }

  try {
    const { order, receive } = await finalizePurchaseOrderReceive(
      admin,
      tenantId,
      id
    );
    if (chegada) {
      await admin.from("purchase_orders").update({ data_chegada_fisica: chegada } as never).eq("id", id).eq("tenant_id", tenantId);
    }
    return apiOk({ data: order, receive, data_chegada_fisica: chegada });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao processar recebimento.",
      500
    );
  }
}
