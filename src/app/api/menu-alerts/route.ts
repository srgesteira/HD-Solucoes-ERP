import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, currentUserCanMenuModule } from "@/modules/core/lib/tenant";
import { loadMenuAlerts } from "@/modules/core/lib/navigation/menu-alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const [compras, engenharia, faturamento, vendas, pcp] = await Promise.all([
    currentUserCanMenuModule("compras"),
    currentUserCanMenuModule("engenharia"),
    currentUserCanMenuModule("faturamento"),
    currentUserCanMenuModule("vendas"),
    currentUserCanMenuModule("pcp"),
  ]);

  const admin = createSupabaseAdminClient();
  const alerts = await loadMenuAlerts(admin, tenantId, {
    compras,
    engenharia,
    faturamento,
    vendas,
    pcp,
  });

  return apiOk({ alerts });
}
