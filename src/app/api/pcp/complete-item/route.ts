import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import { maybeMarkSalesOrderReadyForInvoice } from "@/modules/vendas/lib/sales/sales-order-ready-for-invoice";

export const dynamic = "force-dynamic";

const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T12:00:00.000Z`;
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const orderItemId =
    typeof b.order_item_id === "string" ? b.order_item_id : null;
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("order_items")
    .select("id, production_start, production_end")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return apiError("Item de produção não encontrado", 404);

  const now = todayIso();
  const { data, error } = await admin
    .from("order_items")
    .update({
      production_start: existing.production_start ?? now,
      production_end: now,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .select("id, production_start, production_end, status")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item de produção não encontrado", 404);

  try {
    await maybeMarkSalesOrderReadyForInvoice(admin, tenantId, orderItemId);
  } catch (syncErr) {
    console.warn(
      "[complete-item] Falha ao sincronizar ready_for_invoice:",
      syncErr instanceof Error ? syncErr.message : syncErr
    );
  }

  return apiOk(data);
}
