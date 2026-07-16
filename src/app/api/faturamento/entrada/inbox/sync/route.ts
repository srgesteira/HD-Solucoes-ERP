import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  FocusMdeNotAvailableError,
  syncInboundNfeInboxFromFocus,
} from "@/modules/faturamento/lib/inbound-nfe-inbox-service";

export const dynamic = "force-dynamic";

/** Sincroniza NF-e recebidas da Focus (MDe). Admin only. */
export async function POST(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem sincronizar SEFAZ/MDe.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const result = await syncInboundNfeInboxFromFocus(admin, tenantId);
    return apiOk(result);
  } catch (e) {
    if (e instanceof FocusMdeNotAvailableError) {
      return apiError(e.message, 402);
    }
    return apiError(
      e instanceof Error ? e.message : "Erro ao sincronizar NF recebidas",
      400
    );
  }
}
