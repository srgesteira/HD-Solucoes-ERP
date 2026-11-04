import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { closeSalesOrderBilling } from "@/modules/faturamento/lib/sales-order-billing-closure";

export const dynamic = "force-dynamic";

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
    return apiError("Apenas administradores podem fechar sem nota.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  // Body opcional: { actual_delivery?: "yyyy-mm-dd" }
  let actualDelivery: string | null = null;
  try {
    const text = await request.text();
    if (text.trim()) {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const raw = (parsed as Record<string, unknown>).actual_delivery;
        if (raw !== undefined && raw !== null && raw !== "") {
          if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
            return apiError("Data real de entrega inválida (use aaaa-mm-dd).", 400);
          }
          actualDelivery = raw.trim();
        }
      }
    }
  } catch {
    return apiError("Body inválido", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    const result = await closeSalesOrderBilling(
      admin,
      tenantId,
      orderId,
      "without_invoice",
      { actualDelivery }
    );
    if (!result.ok) {
      return apiError(result.reasons.join(" "), 400);
    }

    const { data: row } = await admin
      .from("sales_orders")
      .select("*")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    return apiOk({ data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao fechar pedido.";
    return apiError(msg, 400);
  }
}
