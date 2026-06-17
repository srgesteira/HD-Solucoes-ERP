import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { recalculateProductCost } from "@/modules/engenharia/lib/products/recalculate-product-cost";
import {
  canProductHaveBom,
  isResaleProductPrefix,
} from "@/modules/engenharia/lib/products/product-bom-eligibility";
import {
  ENGINEERING_STATUS_RELEASED,
} from "@/modules/engenharia/lib/products/engineering-workflow";
import { loadProductCompositionFields } from "@/modules/engenharia/lib/products/product-composition-fields";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
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

  const { data: fields, error: loadErr } = await loadProductCompositionFields(
    admin,
    tenantId,
    productId
  );

  if (loadErr) {
    return apiError(
      "Erro ao carregar produto: " + loadErr,
      supabaseErrorToHttp(undefined)
    );
  }
  if (!fields) return apiError("Produto não encontrado", 404);

  const { data: product, error: pErr } = await admin
    .from("products")
    .select(
      "id, name, cost_price, engineering_workflow_status, released_for_sale, source_quote_id, has_composition"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (pErr) {
    return apiError(
      "Erro ao carregar produto: " + pErr.message,
      supabaseErrorToHttp(pErr.code)
    );
  }
  if (!product) return apiError("Produto não encontrado", 404);

  const prefixCode = fields.prefix_code;
  const isResale = isResaleProductPrefix(prefixCode);
  const usesBom =
    canProductHaveBom(
      prefixCode,
      fields.composition_enabled,
      fields.has_composition
    ) && !isResale;

  let totalCost = Number(product.cost_price ?? 0);

  if (usesBom) {
    const { count: componentCount } = await admin
      .from("product_components")
      .select("*", { count: "exact", head: true })
      .eq("parent_product_id", productId)
      .eq("tenant_id", tenantId);

    if (!componentCount || componentCount < 1) {
      return apiError(
        "Cadastre pelo menos um item na estrutura (BOM) antes de liberar para vendas.",
        400
      );
    }

    totalCost = await recalculateProductCost(admin, tenantId, productId);
  } else if (!Number.isFinite(totalCost) || totalCost <= 0) {
    return apiError(
      "Defina o custo unitário manualmente ou receba uma compra antes de liberar para vendas.",
      400
    );
  }

  const now = new Date().toISOString();

  const { data: updated, error: upErr } = await admin
    .from("products")
    .update({
      engineering_workflow_status: ENGINEERING_STATUS_RELEASED,
      engineering_released_at: now,
      released_for_sale: true,
      released_for_sale_at: now,
      ...(usesBom ? { has_composition: true } : {}),
      ...(!usesBom && totalCost > 0 ? { cost_price: totalCost } : {}),
    })
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select(
      "id, name, cost_price, released_for_sale, engineering_workflow_status, has_composition"
    )
    .single();

  if (upErr) {
    return apiError(
      "Erro ao liberar produto: " + upErr.message,
      supabaseErrorToHttp(upErr.code)
    );
  }

  const quoteIds = new Set<string>();
  if (product.source_quote_id) {
    quoteIds.add(product.source_quote_id);
  }

  const { data: quoteItemRows } = await admin
    .from("quote_items")
    .select("quote_id")
    .eq("product_id", productId)
    .eq("tenant_id", tenantId);

  for (const row of quoteItemRows ?? []) {
    if (row.quote_id) quoteIds.add(row.quote_id);
  }

  if (quoteIds.size > 0) {
    const { error: qErr } = await admin
      .from("quotes")
      .update({ awaiting_commercial_finalize: true })
      .eq("tenant_id", tenantId)
      .in("id", [...quoteIds]);
    if (qErr) {
      return apiError(
        "Produto liberado, mas falhou ao notificar orçamentos: " + qErr.message,
        500
      );
    }
  }

  return apiOk({
    data: updated,
    cost_price: totalCost,
    quotes_notified: quoteIds.size,
    release_mode: usesBom ? "bom" : "manual",
  });
}
