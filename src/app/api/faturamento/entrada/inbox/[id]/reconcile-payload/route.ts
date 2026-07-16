import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { getInboundNfeReconcilePayload } from "@/modules/faturamento/lib/inbound-nfe-inbox-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const accessFaturamento = await assertMenuModuleAccess("faturamento");
  const accessCompras = await assertMenuModuleAccess("compras");
  if (!accessFaturamento.ok && !accessCompras.ok) {
    return accessFaturamento.response;
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const data = await getInboundNfeReconcilePayload(admin, tenantId, id);
    return apiOk({ data });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao preparar conciliação",
      400
    );
  }
}
