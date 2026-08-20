import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { getBlingConnectionStatus } from "@/modules/fiscal/lib/bling/bling-client";
import { getBlingAppConfig } from "@/modules/fiscal/lib/bling/bling-env";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let appConfigured = true;
  try {
    getBlingAppConfig();
  } catch {
    appConfigured = false;
  }

  const admin = createSupabaseAdminClient();
  const status = await getBlingConnectionStatus(admin, tenantId);
  const isAdmin = await isCurrentUserTenantAdmin();

  return apiOk({
    data: {
      app_configured: appConfigured,
      connected: status.connected,
      expires_at: isAdmin ? status.expires_at : null,
      connected_at: status.connected_at,
      scope: status.scope,
      can_manage: isAdmin,
    },
  });
}
