import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { dismissPurchaseRequisitions } from "@/modules/compras/lib/purchasing/requisition-dismiss";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const ids = Array.isArray(b.requisition_ids)
    ? b.requisition_ids.filter((id): id is string => typeof id === "string")
    : [];
  if (!ids.length) return apiError("Seleccione pelo menos uma requisição.", 400);

  const admin = createSupabaseAdminClient();

  try {
    const { dismissed } = await dismissPurchaseRequisitions(admin, tenantId, ids);
    if (dismissed === 0) {
      return apiError("Nenhuma requisição em rascunho encontrada para excluir.", 404);
    }
    return apiOk({ dismissed });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao excluir requisições", 400);
  }
}
