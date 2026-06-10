import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  deleteInventoryMovement,
  updateInventoryMovement,
} from "@/modules/almoxarifado/lib/inventory-movement-admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function assertAdminInventory() {
  const access = await assertMenuModuleAccess("almoxarifado");
  if (!access.ok) return access.response;
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError(
      "Apenas administradores podem alterar movimentos de estoque.",
      403
    );
  }
  return null;
}

/** PATCH /api/inventory/movements/[id] — editar quantidade/motivo (admin) */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const denied = await assertAdminInventory();
  if (denied) return denied;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await context.params;
  if (!id?.trim()) return apiError("id inválido", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const quantity =
    b.quantity !== undefined && b.quantity !== null
      ? Number(b.quantity)
      : undefined;
  const reason = typeof b.reason === "string" ? b.reason : undefined;

  const admin = createSupabaseAdminClient();
  const result = await updateInventoryMovement(admin, tenantId, id, {
    quantity,
    reason,
  });

  if (result.error) {
    return apiError(result.error, result.error.includes("não encontrado") ? 404 : 400);
  }

  return apiOk({ data: result.data });
}

/** DELETE /api/inventory/movements/[id] — excluir movimento e reconciliar saldo (admin) */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const denied = await assertAdminInventory();
  if (denied) return denied;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await context.params;
  if (!id?.trim()) return apiError("id inválido", 400);

  const admin = createSupabaseAdminClient();
  const result = await deleteInventoryMovement(admin, tenantId, id);

  if (result.error) {
    return apiError(
      result.error,
      result.error.includes("não encontrado") ? 404 : 400
    );
  }

  return apiOk({ deleted: true, product_id: result.product_id });
}
