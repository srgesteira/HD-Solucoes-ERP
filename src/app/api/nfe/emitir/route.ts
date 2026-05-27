import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { emitirNFe } from "@/modules/faturamento/lib/nfe/focusnfe.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem emitir NFS-e.", 403);
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

  const sales_order_id =
    typeof b.sales_order_id === "string" ? b.sales_order_id.trim() : "";
  if (!sales_order_id) return apiError("sales_order_id é obrigatório.", 400);

  const admin = createSupabaseAdminClient();

  try {
    const out = await emitirNFe(admin, tenantId, sales_order_id);
    const { data: row } = await admin
      .from("nfes")
      .select("*")
      .eq("id", out.nfe_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return apiOk({
      nfe_id: out.nfe_id,
      focus_ref: out.focus_ref,
      focus: out.focus,
      data: row,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao emitir NFS-e.";
    return apiError(msg, 400);
  }
}
