import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { loadQualityFinishBlockSummaries } from "@/modules/producao/lib/quality-finish-blocks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const moduleDenied = await requireAnyMenuModule([
    "producao",
    "pcp",
    "qualidade",
  ]);
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const orderItemId = request.nextUrl.searchParams.get("order_item_id");
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();

  try {
    const map = await loadQualityFinishBlockSummaries(admin, tenantId, [
      orderItemId,
    ]);
    const summary = map.get(orderItemId) ?? {
      active: null,
      released_count: 0,
      history: [],
    };
    return apiOk({ summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar histórico";
    return apiError(msg, 400);
  }
}
