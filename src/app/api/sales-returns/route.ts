import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  createSalesReturn,
  listSalesReturns,
} from "@/modules/reverse/lib/sales-returns-service";
import {
  RETURN_FINANCIAL_ACTIONS,
  SALES_RETURN_ITEM_CONDITIONS,
  SALES_RETURN_REASONS,
  SALES_RETURN_STATUSES,
  type ReturnFinancialAction,
  type SalesReturnItemCondition,
  type SalesReturnReason,
  type SalesReturnStatus,
} from "@/modules/reverse/lib/returns-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  const status = (
    statusRaw && (SALES_RETURN_STATUSES as readonly string[]).includes(statusRaw)
      ? statusRaw
      : null
  ) as SalesReturnStatus | null;

  try {
    const admin = createSupabaseAdminClient();
    const items = await listSalesReturns(admin, { tenantId, status });
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

  const salesOrderId =
    typeof body.sales_order_id === "string" ? body.sales_order_id : "";
  if (!salesOrderId) return apiError("sales_order_id obrigatório", 400);

  const reasonRaw = String(body.reason ?? "");
  if (!(SALES_RETURN_REASONS as readonly string[]).includes(reasonRaw)) {
    return apiError("Motivo inválido", 400);
  }
  const reason = reasonRaw as SalesReturnReason;

  const finRaw = String(body.financial_action ?? "");
  if (!(RETURN_FINANCIAL_ACTIONS as readonly string[]).includes(finRaw)) {
    return apiError("Ação financeira inválida", 400);
  }
  const financialAction = finRaw as ReturnFinancialAction;

  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  if (itemsRaw.length === 0) return apiError("Adicione pelo menos um item", 400);

  type ItemInput = {
    salesOrderItemId: string;
    quantity: number;
    unitPrice: number;
    condition: SalesReturnItemCondition;
    description?: string | null;
    productId?: string | null;
  };
  const items: ItemInput[] = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const x = it as Record<string, unknown>;
    const soiId = typeof x.sales_order_item_id === "string"
      ? x.sales_order_item_id
      : "";
    if (!soiId) return apiError("Linha sem sales_order_item_id", 400);

    const qty = Number(x.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return apiError("Quantidade inválida em linha", 400);
    }
    const price = Number(x.unit_price ?? 0);
    if (!Number.isFinite(price) || price < 0) {
      return apiError("Preço unitário inválido", 400);
    }

    const condRaw = String(x.condition ?? "a_grade");
    if (!(SALES_RETURN_ITEM_CONDITIONS as readonly string[]).includes(condRaw)) {
      return apiError("Condição inválida", 400);
    }

    items.push({
      salesOrderItemId: soiId,
      quantity: qty,
      unitPrice: price,
      condition: condRaw as SalesReturnItemCondition,
      description: typeof x.description === "string" ? x.description : null,
      productId: typeof x.product_id === "string" ? x.product_id : null,
    });
  }

  try {
    const admin = createSupabaseAdminClient();
    const ret = await createSalesReturn(admin, {
      tenantId,
      userId: user.id,
      userEmail: user.email ?? null,
      input: {
        salesOrderId,
        reason,
        notes: typeof body.notes === "string" ? body.notes : null,
        financialAction,
        restockLocation:
          typeof body.restock_location === "string"
            ? body.restock_location
            : null,
        items,
      },
    });
    return apiOk({ sales_return: ret }, 201);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao criar devolução",
      400
    );
  }
}
