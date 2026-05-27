import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  checkPurchaseDeliveryVsProduction,
} from "@/modules/compras/lib/purchasing/purchase-schedule-conflicts";

export const dynamic = "force-dynamic";

function toDateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).slice(0, 10);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão para editar compras", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const patch: {
    expected_delivery_date?: string | null;
    actual_delivery_date?: string | null;
    need_date?: string | null;
    follow_up_date?: string | null;
  } = {};
  if (b.expected_delivery_date !== undefined) {
    patch.expected_delivery_date = toDateOnly(b.expected_delivery_date);
  }
  if (b.actual_delivery_date !== undefined) {
    patch.actual_delivery_date = toDateOnly(b.actual_delivery_date);
  }
  if (b.need_date !== undefined) {
    patch.need_date = toDateOnly(b.need_date);
  }
  if (b.follow_up_date !== undefined) {
    patch.follow_up_date = toDateOnly(b.follow_up_date);
  }

  if (Object.keys(patch).length === 0) {
    return apiError("Nenhum campo para actualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from("purchase_order_items")
    .select("id, purchase_order_id, sales_order_item_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) return apiError(loadErr.message, 400);
  if (!existing) return apiError("Item não encontrado", 404);

  const { data, error } = await admin
    .from("purchase_order_items")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(
      "id, expected_delivery_date, actual_delivery_date, need_date, follow_up_date, sales_order_item_id"
    )
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item não encontrado", 404);

  let conflict = null;
  if (patch.expected_delivery_date) {
    conflict = await checkPurchaseDeliveryVsProduction(
      admin,
      tenantId,
      id,
      patch.expected_delivery_date
    );
  }

  return apiOk({ item: data, conflict });
}
