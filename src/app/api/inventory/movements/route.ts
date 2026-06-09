import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
  currentUserCanModule,
} from "@/modules/core/lib/tenant";
import {
  isInventoryMovementType,
  listInventoryMovements,
} from "@/modules/almoxarifado/lib/inventory-movements-list";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/inventory/movements — extrato paginado com origem resolvida */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (
    !(await isCurrentUserTenantAdmin()) &&
    !(await currentUserCanModule("inventory"))
  ) {
    return apiError("Sem permissão para consultar estoque.", 403);
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50)
  );

  const productId = sp.get("product_id")?.trim() || undefined;
  const movementTypeRaw = sp.get("movement_type")?.trim();
  let movementType: string | undefined;
  if (movementTypeRaw) {
    if (!isInventoryMovementType(movementTypeRaw)) {
      return apiError(
        "movement_type inválido (use in, out ou adjustment)",
        400
      );
    }
    movementType = movementTypeRaw;
  }

  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();
  if (from && !ISO_DATE.test(from)) {
    return apiError("from inválido (use YYYY-MM-DD)", 400);
  }
  if (to && !ISO_DATE.test(to)) {
    return apiError("to inválido (use YYYY-MM-DD)", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    const result = await listInventoryMovements(admin, tenantId, {
      page,
      limit,
      productId,
      movementType,
      from: from || undefined,
      to: to || undefined,
    });
    return apiOk(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao listar movimentos.";
    return apiError(message, supabaseErrorToHttp(null));
  }
}
