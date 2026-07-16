import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { listInboundNfeInbox } from "@/modules/faturamento/lib/inbound-nfe-inbox-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const status = request.nextUrl.searchParams.get("status")?.trim() || undefined;

  try {
    const admin = createSupabaseAdminClient();
    const data = await listInboundNfeInbox(admin, tenantId, { status });
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar NF recebidas",
      500
    );
  }
}
