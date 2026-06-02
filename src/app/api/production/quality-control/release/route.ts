import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanQualityFinishControl } from "@/modules/qualidade/lib/quality-finish-api-auth";
import { releaseQualityFinish } from "@/modules/producao/lib/quality-finish-blocks";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const moduleDenied = await requireMenuModule("qualidade");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanQualityFinishControl())) {
    return apiError("Sem permissão para liberar finalização (CQ)", 403);
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
  const releaseAction =
    typeof b.release_action === "string"
      ? b.release_action
      : typeof b.acao_tomada === "string"
        ? b.acao_tomada
        : "";
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const admin = createSupabaseAdminClient();

  try {
    const row = await releaseQualityFinish(
      admin,
      tenantId,
      orderItemId,
      releaseAction,
      user.id
    );
    return apiOk({ block: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao liberar";
    return apiError(msg, 400);
  }
}
