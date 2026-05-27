import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { cancelarNFe } from "@/modules/faturamento/lib/nfe/focusnfe.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const nfe_id = typeof b.nfe_id === "string" ? b.nfe_id.trim() : "";
  const justificativa =
    typeof b.justificativa === "string" ? b.justificativa.trim() : "";
  if (!nfe_id) return apiError("nfe_id é obrigatório.", 400);

  const admin = createSupabaseAdminClient();

  try {
    const focus = await cancelarNFe(admin, tenantId, nfe_id, justificativa);
    const { data: row, error } = await admin
      .from("nfes")
      .select("*")
      .eq("id", nfe_id)
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
    const msg = e instanceof Error ? e.message : "Erro ao cancelar.";
    return apiError(msg, 400);
  }
}
