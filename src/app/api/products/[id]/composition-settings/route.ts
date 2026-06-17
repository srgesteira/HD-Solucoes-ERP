import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  canToggleComposition,
  isResaleProductPrefix,
} from "@/modules/engenharia/lib/products/product-bom-eligibility";
import { prefixCodeFromJoin } from "@/modules/engenharia/lib/products/product-lifecycle";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(
      "composition_enabled, has_composition, prefix:product_prefixes!products_prefix_id_fkey(code)"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao carregar produto: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Produto não encontrado", 404);

  const prefixCode = prefixCodeFromJoin(
    data.prefix as { code?: string } | { code?: string }[] | null
  );

  return apiOk({
    composition_enabled: data.composition_enabled === true,
    has_composition: data.has_composition === true,
    can_toggle: canToggleComposition(prefixCode),
    is_resale: isResaleProductPrefix(prefixCode),
    prefix_code: prefixCode,
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const enableFlag =
    body && typeof body === "object" && "composition_enabled" in body
      ? Boolean((body as { composition_enabled?: boolean }).composition_enabled)
      : null;

  if (enableFlag === null) {
    return apiError("composition_enabled é obrigatório", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: product, error: loadErr } = await admin
    .from("products")
    .select(
      "id, composition_enabled, prefix:product_prefixes!products_prefix_id_fkey(code)"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar produto: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }
  if (!product) return apiError("Produto não encontrado", 404);

  const prefixCode = prefixCodeFromJoin(
    product.prefix as { code?: string } | { code?: string }[] | null
  );

  if (isResaleProductPrefix(prefixCode)) {
    return apiError(
      "Produtos de revenda (HD3 / RV) não podem ter composição activada.",
      400
    );
  }

  if (!canToggleComposition(prefixCode)) {
    return apiError(
      "Este prefixo não permite activar ou desactivar composição por aqui.",
      400
    );
  }

  if (!enableFlag) {
    const { count } = await admin
      .from("product_components")
      .select("*", { count: "exact", head: true })
      .eq("parent_product_id", productId)
      .eq("tenant_id", tenantId);

    if ((count ?? 0) > 0) {
      return apiError(
        "Remova todas as linhas da composição antes de desactivá-la.",
        400
      );
    }
  }

  const { data: updated, error: upErr } = await admin
    .from("products")
    .update({ composition_enabled: enableFlag })
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select("id, composition_enabled, has_composition")
    .single();

  if (upErr) {
    return apiError(
      "Erro ao actualizar composição: " + upErr.message,
      supabaseErrorToHttp(upErr.code)
    );
  }

  return apiOk({ data: updated });
}
