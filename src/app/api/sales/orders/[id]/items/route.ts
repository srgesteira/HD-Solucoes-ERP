import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ITEM_SELECT = `
  *,
  product:products!sales_order_items_product_id_fkey(*)
`.trim();

async function resolveSalesOrder(
  admin: SupabaseClient<Database>,
  tenantId: string,
  orderId: string
) {
  const { data, error } = await admin
    .from("sales_orders")
    .select("id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return { order: data, error };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveSalesOrder(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  const { data, error } = await admin
    .from("sales_order_items")
    .select(ITEM_SELECT)
    .eq("sales_order_id", orderId)
    .eq("tenant_id", tenantId)
    .order("line_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar itens: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const description =
    typeof b.description === "string" ? b.description.trim() : "";
  const quantityRaw = b.quantity;
  const quantity =
    typeof quantityRaw === "number"
      ? quantityRaw
      : typeof quantityRaw === "string"
        ? parseFloat(quantityRaw.replace(",", "."))
        : NaN;

  if (!description) {
    return apiError("Descrição é obrigatória", 400);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return apiError("Quantidade inválida", 400);
  }

  const unit_price =
    b.unit_price === undefined || b.unit_price === null
      ? 0
      : typeof b.unit_price === "number"
        ? b.unit_price
        : parseFloat(String(b.unit_price).replace(",", "."));

  if (!Number.isFinite(unit_price) || unit_price < 0) {
    return apiError("Preço unitário inválido", 400);
  }

  const unit =
    b.unit !== undefined && b.unit !== null && String(b.unit).trim()
      ? String(b.unit).trim()
      : "UN";

  const product_id =
    b.product_id === undefined || b.product_id === null
      ? null
      : String(b.product_id);

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveSalesOrder(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  const { data: lastLine } = await admin
    .from("sales_order_items")
    .select("line_number")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", orderId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextLineNumber = (lastLine?.line_number ?? 0) + 1;

  let unit_cost: number | null = null;

  if (product_id) {
    const { data: product } = await admin
      .from("products")
      .select("id, cost_price")
      .eq("id", product_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!product) return apiError("Produto inválido", 400);
    unit_cost = product.cost_price;
  }

  const { data, error } = await admin
    .from("sales_order_items")
    .insert({
      tenant_id: tenantId,
      sales_order_id: orderId,
      line_number: nextLineNumber,
      product_id,
      description,
      quantity,
      unit,
      unit_price,
      unit_cost,
    })
    .select()
    .single();

  if (error) {
    return apiError(
      "Erro ao adicionar item: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: orderId } = await params;
  const itemId = request.nextUrl.searchParams.get("itemId");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  if (!itemId?.trim()) {
    return apiError("Parâmetro itemId é obrigatório.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { order, error: orderErr } = await resolveSalesOrder(
    admin,
    tenantId,
    orderId
  );
  if (orderErr) {
    return apiError(
      "Erro ao validar pedido: " + orderErr.message,
      supabaseErrorToHttp(orderErr.code)
    );
  }
  if (!order) return apiError("Pedido não encontrado", 404);

  const { data: deleted, error } = await admin
    .from("sales_order_items")
    .delete()
    .eq("id", itemId.trim())
    .eq("sales_order_id", orderId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao remover item: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!deleted) return apiError("Item não encontrado", 404);

  return apiOk({ success: true });
}
