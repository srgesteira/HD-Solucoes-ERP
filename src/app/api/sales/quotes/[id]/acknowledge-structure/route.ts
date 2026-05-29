import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Comercial abriu o orçamento após engenharia libertar custos — remove destaque. */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("quotes")
    .update({ awaiting_commercial_finalize: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, awaiting_commercial_finalize")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao actualizar orçamento: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Orçamento não encontrado", 404);

  return apiOk({ data });
}
