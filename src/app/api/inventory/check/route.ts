import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
  currentUserCanModule,
} from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

/** GET /api/inventory/check?product_id=...&quantity=... */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (
    !(await isCurrentUserTenantAdmin()) &&
    !(await currentUserCanModule("inventory"))
  ) {
    return apiError("Sem permissão para consultar estoque.", 403);
  }

  const productId = request.nextUrl.searchParams.get("product_id")?.trim();
  if (!productId) {
    return apiError("Parâmetro product_id é obrigatório", 400);
  }

  const qtyRaw = request.nextUrl.searchParams.get("quantity");
  const quantity =
    qtyRaw != null && qtyRaw !== ""
      ? parseFloat(qtyRaw.replace(",", "."))
      : 0;

  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("inventory")
    .select("quantity_on_hand, reserved_quantity")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    return apiError("Estoque: " + error.message, supabaseErrorToHttp(error.code));
  }

  const onHand = Number(row?.quantity_on_hand ?? 0);
  const reserved = Number(row?.reserved_quantity ?? 0);
  const available = onHand - reserved;
  const ok =
    quantity <= 0 ? available > 0 : available + 1e-9 >= quantity;

  return apiOk({
    product_id: productId,
    quantity_on_hand: onHand,
    reserved_quantity: reserved,
    available,
    requested_quantity: quantity,
    sufficient: ok,
  });
}
