import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  createPurchaseReturn,
  listPurchaseReturns,
} from "@/modules/reverse/lib/purchase-returns-service";
import {
  PURCHASE_RETURN_REASONS,
  RETURN_FINANCIAL_ACTIONS,
  type PurchaseReturnReason,
  type ReturnFinancialAction,
} from "@/modules/reverse/lib/returns-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const items = await listPurchaseReturns(admin, { tenantId });
    return apiOk({ items });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar devoluções",
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }

  const purchaseOrderId =
    typeof body.purchase_order_id === "string" ? body.purchase_order_id : "";
  if (!purchaseOrderId) return apiError("purchase_order_id obrigatório", 400);

  const reasonRaw = String(body.reason ?? "");
  if (!(PURCHASE_RETURN_REASONS as readonly string[]).includes(reasonRaw)) {
    return apiError("Motivo inválido", 400);
  }
  const reason = reasonRaw as PurchaseReturnReason;

  const finRaw = String(body.financial_action ?? "");
  if (!(RETURN_FINANCIAL_ACTIONS as readonly string[]).includes(finRaw)) {
    return apiError("Ação financeira inválida", 400);
  }
  const financialAction = finRaw as ReturnFinancialAction;

  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  if (itemsRaw.length === 0) return apiError("Adicione pelo menos um item", 400);

  type ItemInput = {
    purchaseOrderItemId: string;
    productId: string | null;
    description: string | null;
    quantity: number;
    unitPrice: number;
  };
  const items: ItemInput[] = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const x = it as Record<string, unknown>;
    const poiId =
      typeof x.purchase_order_item_id === "string"
        ? x.purchase_order_item_id
        : "";
    if (!poiId) return apiError("Linha sem purchase_order_item_id", 400);
    const qty = Number(x.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return apiError("Quantidade inválida em linha", 400);
    }
    const price = Number(x.unit_price ?? 0);
    if (!Number.isFinite(price) || price < 0) {
      return apiError("Preço unitário inválido", 400);
    }
    items.push({
      purchaseOrderItemId: poiId,
      productId: typeof x.product_id === "string" ? x.product_id : null,
      description: typeof x.description === "string" ? x.description : null,
      quantity: qty,
      unitPrice: price,
    });
  }

  try {
    const admin = createSupabaseAdminClient();
    const ret = await createPurchaseReturn(admin, {
      tenantId,
      userId: user.id,
      userEmail: user.email ?? null,
      input: {
        purchaseOrderId,
        reason,
        notes: typeof body.notes === "string" ? body.notes : null,
        financialAction,
        items,
      },
    });
    return apiOk({ purchase_return: ret }, 201);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao criar devolução",
      400
    );
  }
}
