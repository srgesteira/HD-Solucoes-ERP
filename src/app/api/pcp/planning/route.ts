import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { fetchPcpPlanning } from "@/lib/pcp-planning";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  try {
    const orders = await fetchPcpPlanning(admin, tenantId);
    return apiOk({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar planeamento PCP.";
    return apiError(msg, 400);
  }
}
