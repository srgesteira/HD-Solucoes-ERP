import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { getSalesReturnDetail } from "@/modules/reverse/lib/sales-returns-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const detail = await getSalesReturnDetail(admin, {
      tenantId,
      returnId: id,
    });
    if (!detail) return apiError("Devolução não encontrada", 404);
    return apiOk(detail);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao buscar devolução",
      500
    );
  }
}
