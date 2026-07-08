import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
  currentUserCanModule,
} from "@/modules/core/lib/tenant";
import {
  applyManualInventoryOutbound,
  searchProductionOrdersForManualOut,
} from "@/modules/almoxarifado/lib/inventory-manual-out";

export const dynamic = "force-dynamic";

async function assertInventoryAccess(): Promise<Response | null> {
  if (
    !(await isCurrentUserTenantAdmin()) &&
    !(await currentUserCanModule("inventory"))
  ) {
    return apiError("Sem permissão para o almoxarifado.", 403);
  }
  return null;
}

/** GET — busca OPs para vincular à saída manual */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const denied = await assertInventoryAccess();
  if (denied) return denied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  try {
    const admin = createSupabaseAdminClient();
    const data = await searchProductionOrdersForManualOut(
      admin,
      tenantId,
      search
    );
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao buscar OPs",
      400
    );
  }
}

/** POST — regista saída manual (opcionalmente vinculada a uma OP) */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem registar saída manual.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const b =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const productId = typeof b.product_id === "string" ? b.product_id.trim() : "";
  const quantity = Number(b.quantity);
  const reason =
    typeof b.reason === "string" ? b.reason.trim() || null : null;
  const productionOrderId =
    typeof b.production_order_id === "string"
      ? b.production_order_id.trim() || null
      : null;

  if (!productId) return apiError("product_id é obrigatório", 400);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return apiError("quantity inválida", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await applyManualInventoryOutbound(admin, tenantId, {
      productId,
      quantity,
      reason,
      productionOrderId,
      userId: user.id,
    });
    return apiOk(result, 201);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao registar saída",
      400
    );
  }
}
