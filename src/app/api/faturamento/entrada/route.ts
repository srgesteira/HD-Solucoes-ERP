import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { isFiscalInboundListTab } from "@/modules/faturamento/lib/fiscal-inbound-list-tabs";
import { listFiscalInboundOrders } from "@/modules/faturamento/lib/fiscal-inbound-list-service";

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

  const searchParams = request.nextUrl.searchParams;
  const tabParam = searchParams.get("tab")?.trim() ?? "open";
  if (!isFiscalInboundListTab(tabParam)) {
    return apiError("Aba inválida", 400);
  }

  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );

  try {
    const admin = createSupabaseAdminClient();
    const result = await listFiscalInboundOrders(admin, tenantId, {
      tab: tabParam,
      search,
      page,
      limit,
    });
    return apiOk(result);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar entrada fiscal",
      500
    );
  }
}
