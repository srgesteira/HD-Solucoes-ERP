import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { applyFiscalToPurchaseOrderItems } from "@/modules/fiscal/lib/fiscal-rules-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Reaplica regras fiscais a todos os itens do PC (módulo Faturamento). */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const result = await applyFiscalToPurchaseOrderItems(
      admin,
      tenantId,
      id,
      user.id
    );
    return apiOk(result);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao aplicar fiscal",
      500
    );
  }
}
