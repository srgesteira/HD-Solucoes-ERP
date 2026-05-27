import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const LOG_SELECT = `
  id,
  sales_order_id,
  field_name,
  old_value,
  new_value,
  notes,
  changed_at,
  changed_by,
  changed_by_user:user_profiles!sales_order_logs_changed_by_fkey(
    id,
    full_name,
    email
  )
`.trim();

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canSales = await currentUserCanModule("sales");
  if (!isAdmin && !canSales) {
    return apiError("Sem permissão para ver histórico do pedido", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("sales_orders")
    .select("id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!order) return apiError("Pedido não encontrado", 404);

  const { data, error } = await admin
    .from("sales_order_logs")
    .select(LOG_SELECT)
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", orderId)
    .order("changed_at", { ascending: false });

  if (error) {
    return apiError(
      "Erro ao carregar histórico: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}
