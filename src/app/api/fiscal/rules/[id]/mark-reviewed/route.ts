import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * §7.7 — marca a regra como revisada hoje. Não altera alíquotas; só
 * atualiza last_reviewed_at/last_reviewed_by para tirar a regra da fila
 * "Regras a revisar". Ajustes de alíquota seguem fluxo normal de edição.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const { data, error } = await db
    .from("fiscal_rules")
    .update({
      last_reviewed_at: new Date().toISOString(),
      last_reviewed_by: user.id,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, last_reviewed_at, last_reviewed_by")
    .maybeSingle();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }
  if (!data) return apiError("Regra não encontrada", 404);

  return apiOk({ rule: data });
}
