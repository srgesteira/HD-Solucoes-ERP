import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

/**
 * §7.7 — listagem das regras que precisam de atenção da contadora:
 * nunca revisadas, revisadas há mais que o intervalo, vencidas, ou
 * próximas de vencer.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);

  const { data, error } = await db
    .from("v_fiscal_rules_to_review")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true });

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  type Row = {
    id: string;
    name: string;
    priority: number;
    is_active: boolean;
    valid_from: string | null;
    valid_until: string | null;
    last_reviewed_at: string | null;
    review_interval_months: number;
    needs_review: boolean;
    is_expired: boolean;
    is_expiring_soon: boolean;
  };

  const all = (data ?? []) as Row[];
  const items = all.filter(
    (r) => r.needs_review || r.is_expired || r.is_expiring_soon
  );

  return apiOk({
    items,
    total: items.length,
    expired: items.filter((r) => r.is_expired).length,
    expiringSoon: items.filter((r) => r.is_expiring_soon).length,
    needsReview: items.filter((r) => r.needs_review).length,
  });
}
