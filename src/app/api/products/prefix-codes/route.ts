import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { filterAllowedPrefixCodes } from "@/modules/engenharia/lib/products/product-prefix-access";

export const dynamic = "force-dynamic";

/** Prefixos distintos usados em produtos do tenant (para abas da listagem). */
export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireAnyMenuModule(["engenharia", "vendas"]);
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("products")
    .select("prefix:product_prefixes!products_prefix_id_fkey(code)")
    .eq("tenant_id", tenantId)
    .not("prefix_id", "is", null);

  if (error) {
    return apiError(
      "Erro ao listar prefixos: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const rawCodes: string[] = [];
  for (const row of data ?? []) {
    const prefix = row.prefix as { code?: string } | null;
    const code = prefix?.code?.trim();
    if (code) rawCodes.push(code);
  }

  const codes = filterAllowedPrefixCodes(rawCodes, isAdmin);

  return apiOk({ data: codes });
}
