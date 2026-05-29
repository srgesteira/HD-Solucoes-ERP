import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireAnyMenuModule(["engenharia", "vendas"]);
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const materialId = request.nextUrl.searchParams.get("material_id")?.trim();
  if (!materialId || !/^[0-9a-f-]{36}$/i.test(materialId)) {
    return apiOk({ data: [] });
  }

  const admin = createSupabaseAdminClient();
  const { data: matOk } = await admin
    .from("product_materials")
    .select("id")
    .eq("id", materialId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!matOk) {
    return apiOk({ data: [] });
  }

  const { data, error } = await admin
    .from("product_finishes")
    .select("id,code,name,sort_order,material_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .or(`material_id.eq.${materialId},material_id.is.null`)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar acabamentos: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}
