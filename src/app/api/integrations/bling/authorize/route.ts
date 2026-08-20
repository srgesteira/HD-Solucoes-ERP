import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  buildBlingAuthorizeUrl,
  createBlingOAuthState,
} from "@/modules/fiscal/lib/bling/bling-oauth";
import { getBlingAppConfig } from "@/modules/fiscal/lib/bling/bling-env";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem ligar o Bling.", 403);
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    getBlingAppConfig();
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Bling não configurado.", 400);
  }

  const admin = createSupabaseAdminClient();
  const state = await createBlingOAuthState(admin, tenantId, user.id);
  const url = buildBlingAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
