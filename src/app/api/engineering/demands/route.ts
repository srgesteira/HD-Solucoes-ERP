import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { loadEngineeringDemands } from "@/modules/engenharia/lib/products/engineering-demands";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sortParam = request.nextUrl.searchParams.get("sort");
  const sort = sortParam === "oldest" ? "oldest" : "urgency";

  const admin = createSupabaseAdminClient();
  try {
    const items = await loadEngineeringDemands(admin, tenantId, sort);
    return apiOk({ items, total: items.length });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar fila de engenharia",
      500
    );
  }
}
