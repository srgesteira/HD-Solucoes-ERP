import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanQualityFinishControl } from "@/modules/qualidade/lib/quality-finish-api-auth";
import {
  getChecklistExecutionSummary,
  upsertChecklistCompletions,
} from "@/modules/hvac/lib/hvac-pop-checklist-service";
import { upsertHvacChecklistCompletionsSchema } from "@/shared/contracts/hvac-pop-checklist.schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const moduleDenied = await requireMenuModule("qualidade");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const orderItemId = request.nextUrl.searchParams.get("order_item_id");
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  try {
    const admin = createSupabaseAdminClient();
    const summary = await getChecklistExecutionSummary(
      admin,
      tenantId,
      orderItemId
    );
    return apiOk({ summary });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao consultar checklist",
      400
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const moduleDenied = await requireMenuModule("qualidade");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanQualityFinishControl())) {
    return apiError("Sem permissão para registar checklist POP (CQ)", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = upsertHvacChecklistCompletionsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Dados inválidos", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const summary = await upsertChecklistCompletions(admin, {
      tenantId,
      userId: user.id,
      input: parsed.data,
    });
    return apiOk({ summary });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao gravar checklist",
      400
    );
  }
}
