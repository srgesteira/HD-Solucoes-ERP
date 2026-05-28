import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { convertQuoteToSalesOrder } from "@/modules/vendas/lib/sales/quote-convert";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function paymentInt(
  raw: Record<string, unknown>,
  key: string,
  def: number
): number | { error: string } {
  if (raw[key] === undefined || raw[key] === null) return def;
  const v =
    typeof raw[key] === "number"
      ? raw[key]
      : parseInt(String(raw[key]), 10);
  if (!Number.isFinite(v) || v < 0) {
    return { error: `Campo ${key} inválido` };
  }
  return v;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: quoteId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    /* body vazio permitido */
  }

  const pi = paymentInt(body, "payment_installments", 1);
  const pd1 = paymentInt(body, "payment_days_to_first_due", 30);
  const pdb = paymentInt(body, "payment_days_between_installments", 30);
  for (const x of [pi, pd1, pdb]) {
    if (typeof x === "object" && x !== null && "error" in x) {
      return apiError((x as { error: string }).error, 400);
    }
  }

  const admin = createSupabaseAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select("status")
    .eq("id", quoteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!quote) return apiError("Orçamento não encontrado", 404);

  if (quote.status !== "approved") {
    return apiError("Apenas orçamentos aprovados podem ser convertidos", 400);
  }

  const result = await convertQuoteToSalesOrder(
    admin,
    tenantId,
    quoteId,
    user.id,
    {
      payment_installments: pi as number,
      payment_days_to_first_due: pd1 as number,
      payment_days_between_installments: pdb as number,
    }
  );

  if (!result.ok) {
    return apiError(result.message, result.status);
  }

  const { data: detail, error: dErr } = await admin
    .from("sales_orders")
    .select(
      `
      *,
      items:sales_order_items(
        *,
        product:products!sales_order_items_product_id_fkey(*)
      ),
      quote:quotes!sales_orders_quote_id_fkey(*),
      production_order:production_orders!sales_orders_production_order_id_fkey(*)
    `
    )
    .eq("id", result.salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (dErr) {
    return apiOk({
      data: { id: result.salesOrderId, order_number: result.orderNumber },
      warning: "Pedido criado; detalhe não recarregado: " + dErr.message,
    });
  }

  return apiOk({ data: detail }, 201);
}
