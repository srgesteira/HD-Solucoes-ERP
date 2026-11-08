import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Margem por família (centros 1.xx). GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Cálculo inteiro no banco (fn_cost_margin_report) → JSON compacto (barato para o agente ler).
 */
export async function GET(request: NextRequest) {
  const gate = await assertMenuModuleAccess("finance");
  if (!gate.ok) return gate.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const now = new Date();
  const defFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defTo = now.toISOString().slice(0, 10);
  const from = request.nextUrl.searchParams.get("from") ?? defFrom;
  const to = request.nextUrl.searchParams.get("to") ?? defTo;
  if (!ISO.test(from) || !ISO.test(to) || from > to) return apiError("Período inválido", 400);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin.rpc("fn_cost_margin_report", {
    p_tenant: tenantId,
    p_from: from,
    p_to: to,
  });
  if (error) return apiError("Erro no relatório: " + error.message, 500);
  return apiOk(data ?? {});
}
