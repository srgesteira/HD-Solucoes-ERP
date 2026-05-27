import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { asUntypedAdmin } from "@/lib/supabase/untyped-tables";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await assertModuleAccess("sales");
  if (!access.ok) return access.response;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin
    .from("rejection_reasons")
    .select("id, reason, sort_order")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar motivos: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}
