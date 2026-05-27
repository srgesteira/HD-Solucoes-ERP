import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  countPurchaseRequisitions,
  fetchPurchaseRequisitions,
} from "@/modules/compras/lib/purchasing-requisitions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const countOnly = request.nextUrl.searchParams.get("count") === "1";

  try {
    const admin = createSupabaseAdminClient();
    if (countOnly) {
      const pending = await countPurchaseRequisitions(admin, tenantId);
      return apiOk({ pending });
    }
    const rows = await fetchPurchaseRequisitions(admin, tenantId);
    return apiOk({ rows, pending: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar requisições";
    return apiError(msg, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return apiError("id é obrigatório", 400);

  const followUp =
    b.follow_up_date === null || b.follow_up_date === ""
      ? null
      : String(b.follow_up_date).slice(0, 10);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("purchase_order_items")
    .update({ follow_up_date: followUp })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .is("purchase_order_id", null)
    .select("id, follow_up_date")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Requisição não encontrada", 404);

  return apiOk({ data });
}
