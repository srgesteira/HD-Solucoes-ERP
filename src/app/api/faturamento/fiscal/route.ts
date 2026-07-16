import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  FISCAL_INVOICING_LIST_TAB_DEFAULT,
  isFiscalInvoicingListTab,
} from "@/modules/faturamento/lib/fiscal-invoicing-list-tabs";
import { listFiscalInvoicingOrders } from "@/modules/faturamento/lib/fiscal-invoicing-list-service";

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
  const tabParam =
    searchParams.get("tab")?.trim() ?? FISCAL_INVOICING_LIST_TAB_DEFAULT;
  if (!isFiscalInvoicingListTab(tabParam)) {
    return apiError("Aba inválida", 400);
  }

  const search =
    searchParams.get("search")?.trim() ??
    searchParams.get("client")?.trim() ??
    "";

  const page = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10) || 25)
  );

  const admin = createSupabaseAdminClient();

  try {
    const result = await listFiscalInvoicingOrders(admin, tenantId, {
      tab: tabParam,
      search,
      page,
      limit,
    });
    return apiOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao listar faturamento fiscal";
    return apiError(msg, 500);
  }
}
