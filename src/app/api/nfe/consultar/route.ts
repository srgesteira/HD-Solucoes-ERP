import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  currentUserCanMenuModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { consultarNFe } from "@/modules/faturamento/lib/nfe/focusnfe.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nfeId = request.nextUrl.searchParams.get("nfe_id")?.trim();
  if (!nfeId) return apiError("Parâmetro nfe_id é obrigatório.", 400);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const isAdmin = await isCurrentUserTenantAdmin();
  const canExpedicao = await currentUserCanMenuModule("expedicao");
  const canFaturamento = await currentUserCanMenuModule("faturamento");
  if (!isAdmin && !canExpedicao && !canFaturamento) {
    return apiError("Sem permissão para consultar nota.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  try {
    const focus = await consultarNFe(admin, tenantId, nfeId);
    const { data: row, error } = await admin
      .from("nfes")
      .select("*")
      .eq("id", nfeId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      return apiError(
        "Erro ao ler NFS-e: " + error.message,
        supabaseErrorToHttp(error.code)
      );
    }
    return apiOk({ data: row, focus });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar.";
    return apiError(msg, 400);
  }
}
