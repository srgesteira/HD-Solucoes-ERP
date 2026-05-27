import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  isMissingColumnError,
  REQUISITIONS_MIGRATION_HINT,
} from "@/lib/purchasing-requisitions";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão", 403);
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

  const patch: { suggested_supplier_id?: string | null } = {};
  if (b.suggested_supplier_id !== undefined) {
    patch.suggested_supplier_id =
      b.suggested_supplier_id === null || b.suggested_supplier_id === ""
        ? null
        : String(b.suggested_supplier_id);
  }

  if (Object.keys(patch).length === 0) {
    return apiError("Nenhum campo para actualizar", 400);
  }

  const admin = createSupabaseAdminClient();

  if (patch.suggested_supplier_id) {
    const { data: sup } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", patch.suggested_supplier_id)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!sup) return apiError("Fornecedor inválido", 400);
  }

  const { data, error } = await admin
    .from("purchase_order_items")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .is("purchase_order_id", null)
    .select("id, suggested_supplier_id")
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error, "suggested_supplier_id")) {
      return apiError(
        `Coluna suggested_supplier_id ausente. ${REQUISITIONS_MIGRATION_HINT}`,
        503
      );
    }
    return apiError(error.message, 400);
  }
  if (!data) return apiError("Requisição não encontrada", 404);

  return apiOk({ data });
}
