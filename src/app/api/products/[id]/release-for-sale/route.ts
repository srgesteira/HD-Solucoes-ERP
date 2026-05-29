import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { recalculateProductCost } from "@/modules/engenharia/lib/products/recalculate-product-cost";
import {
  ENGINEERING_STATUS_PENDING,
  ENGINEERING_STATUS_RELEASED,
} from "@/modules/engenharia/lib/products/engineering-workflow";

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

  const { data: product, error: pErr } = await admin
    .from("products")
    .select(
      "id, name, engineering_workflow_status, released_for_sale, source_quote_id"
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

  const totalCost = await recalculateProductCost(admin, tenantId, productId);
  const now = new Date().toISOString();

  const { data: updated, error: upErr } = await admin
    .from("products")
    .update({
      engineering_workflow_status: ENGINEERING_STATUS_RELEASED,
      engineering_released_at: now,
      released_for_sale: true,
      released_for_sale_at: now,
      has_composition: true,
    })
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select("id, name, cost_price, released_for_sale, engineering_workflow_status")
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
  });
}
