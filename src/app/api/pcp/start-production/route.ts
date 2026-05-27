import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";

export const dynamic = "force-dynamic";

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
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("order_items")
    .update({ production_start: now, status: "in_progress" })
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .select("id, production_start")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item de produção não encontrado", 404);

  return apiOk({ order_item_id: data.id, production_start: data.production_start });
}
