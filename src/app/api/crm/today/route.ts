import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

/** Agenda do CRM em uma chamada (contatos do dia, tarefas, oportunidades paradas, funil). */
export async function GET(request: NextRequest) {
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);
  const date = request.nextUrl.searchParams.get("date");
  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin.rpc("fn_crm_today", {
    p_tenant: tenantId,
    ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { p_date: date } : {}),
  });
  if (error) return apiError(error.message, 500);
  return apiOk(data ?? {});
}
