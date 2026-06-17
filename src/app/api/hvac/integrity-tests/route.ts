import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanQualityFinishControl } from "@/modules/qualidade/lib/quality-finish-api-auth";
import {
  getIntegrityTestSummary,
  registerIntegrityTest,
} from "@/modules/hvac/lib/hvac-integrity-test-service";
import { registerHvacIntegrityTestSchema } from "@/shared/contracts/hvac-integrity-test.schema";

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
    const summary = await getIntegrityTestSummary(
      admin,
      tenantId,
      orderItemId
    );
    return apiOk({ summary });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao consultar teste",
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
    return apiError("Sem permissão para registar teste de integridade (CQ)", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = registerHvacIntegrityTestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Dados inválidos", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const test = await registerIntegrityTest(admin, {
      tenantId,
      userId: user.id,
      input: parsed.data,
    });
    const summary = await getIntegrityTestSummary(
      admin,
      tenantId,
      parsed.data.order_item_id
    );
    return apiOk({ test, summary });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao registar teste",
      400
    );
  }
}
