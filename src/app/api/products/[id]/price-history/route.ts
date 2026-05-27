import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  groupPriceHistoryByType,
  listProductPriceHistory,
  PRODUCT_PRICE_TYPES,
  type ProductPriceType,
} from "@/modules/engenharia/lib/products/product-price-history";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("price_type")?.trim();
  let priceType: ProductPriceType | undefined;
  if (typeParam) {
    if (!(PRODUCT_PRICE_TYPES as readonly string[]).includes(typeParam)) {
      return apiError(
        "price_type inválido. Use purchase, production_cost ou sale.",
        400
      );
    }
    priceType = typeParam as ProductPriceType;
  }

  const admin = createSupabaseAdminClient();

  const { data: product, error: pErr } = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (pErr) return apiError("Erro ao validar produto: " + pErr.message, 500);
  if (!product) return apiError("Produto não encontrado", 404);

  try {
    const rows = await listProductPriceHistory(
      admin,
      tenantId,
      productId,
      priceType
    );
    return apiOk({
      data: rows,
      grouped: groupPriceHistoryByType(rows),
    });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar histórico.",
      500
    );
  }
}
