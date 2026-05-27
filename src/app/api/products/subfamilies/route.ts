import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const familyId = request.nextUrl.searchParams.get("family_id")?.trim();
  if (!familyId || !/^[0-9a-f-]{36}$/i.test(familyId)) {
    return apiOk({ data: [] });
  }

  const admin = createSupabaseAdminClient();
  const { data: famOk } = await admin
    .from("product_families")
    .select("id")
    .eq("id", familyId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!famOk) {
    return apiOk({ data: [] });
  }

  const { data, error } = await admin
    .from("product_subfamilies")
    .select("id,family_id,code,name,sort_order")
    .eq("tenant_id", tenantId)
    .eq("family_id", familyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar sub-famílias: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}
