import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { loadCurrentUserMenuAccess } from "@/modules/core/lib/tenant";
import { loadMenuAlerts } from "@/modules/core/lib/navigation/menu-alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await loadCurrentUserMenuAccess();
  if (!access?.tenantId) return apiError("Tenant não encontrado", 403);

  const { menuModules } = access;
  const admin = createSupabaseAdminClient();
  const alerts = await loadMenuAlerts(admin, access.tenantId, {
    compras: menuModules.compras === true,
    engenharia: menuModules.engenharia === true,
    faturamento: menuModules.faturamento === true,
    vendas: menuModules.vendas === true,
    pcp: menuModules.pcp === true,
  });

  return apiOk({ alerts });
}
