import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { fetchPcpPlanning } from "@/modules/pcp/lib/pcp-planning";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireAnyMenuModule([
    "producao",
    "pcp",
    "qualidade",
  ]);
  if (moduleDenied) return moduleDenied;

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
