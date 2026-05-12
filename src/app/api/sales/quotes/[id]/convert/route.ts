import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import {
  insertSalesOrderItemsFromLines,
  nextSalesOrderNumber,
  generateReceivablesForSalesOrder,
  ensureProductionOrderForSales,
  rollbackSalesOrderCreation,
  type SaleLineInput,
} from "@/lib/sales/sales-flow";

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

  const b = body;

  const pi = paymentInt(b, "payment_installments", 1);
  const pd1 = paymentInt(b, "payment_days_to_first_due", 30);
  const pdb = paymentInt(b, "payment_days_between_installments", 30);
  for (const x of [pi, pd1, pdb]) {
    if (typeof x === "object" && x !== null && "error" in x) {
      return apiError((x as { error: string }).error, 400);
    }
  }
  const installments = pi as number;
  const daysFirst = pd1 as number;
  const daysBetween = pdb as number;
  if (installments < 1) return apiError("payment_installments mínimo 1", 400);

  const admin = createSupabaseAdminClient();

  const { data: quote, error: qErr } = await admin
    .from("quotes")
    .select(
      `
      *,
      items:quote_items(
        *,
        product:products!quote_items_product_id_fkey(id, type)
      )
    `
    )
    .eq("id", quoteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (qErr) {
    return apiError(
      "Erro ao buscar orçamento: " + qErr.message,
      supabaseErrorToHttp(qErr.code)
    );
  }
  if (!quote) return apiError("Orçamento não encontrado", 404);

  if (quote.status !== "approved") {
    return apiError("Apenas orçamentos aprovados podem ser convertidos", 400);
  }
  if (quote.converted_to_sale_id) {
    return apiError("Orçamento já convertido em pedido de venda", 409);
  }

  const rawItems =
    quote.items as unknown as Array<Record<string, unknown>> | null;
  if (!rawItems?.length) {
    return apiError("Orçamento não possui itens para converter", 400);
  }

  const lines: SaleLineInput[] = [];
  for (const it of rawItems) {
    lines.push({
      product_id:
        typeof it.product_id === "string" ? it.product_id : null,
      description: typeof it.description === "string" ? it.description : "",
      quantity:
        typeof it.quantity === "number"
          ? it.quantity
          : parseFloat(String(it.quantity ?? 0)),
      unit: typeof it.unit === "string" ? it.unit : "UN",
      unit_price:
        typeof it.unit_price === "number"
          ? it.unit_price
          : parseFloat(String(it.unit_price ?? 0)),
    });
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const order_number = await nextSalesOrderNumber(admin, tenantId);
  const order_date = new Date().toISOString().slice(0, 10);

  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .insert({
      tenant_id: tenantId,
      order_number,
      quote_id: quoteId,
      client_name: quote.client_name,
      client_document: quote.client_document,
      client_email: quote.client_email,
      client_phone: quote.client_phone,
      client_address: null,
      order_date,
      status: "pending",
      discount: quote.discount,
      tax: quote.tax,
      notes: quote.notes,
      created_by: profile?.id ?? null,
      payment_installments: installments,
      payment_days_to_first_due: daysFirst,
      payment_days_between_installments: daysBetween,
    })
    .select()
    .single();

  if (soErr?.code === "23505") {
    return apiError("Número do pedido já existe", 409);
  }
  if (soErr) {
    return apiError(
      "Erro ao criar pedido de venda: " + soErr.message,
      supabaseErrorToHttp(soErr.code)
    );
  }

  const ins = await insertSalesOrderItemsFromLines(
    admin,
    tenantId,
    so.id,
    lines
  );
  if (ins.error) {
    await admin.from("sales_orders").delete().eq("id", so.id).eq("tenant_id", tenantId);
    return apiError("Erro ao copiar itens: " + ins.error, 500);
  }

  const { error: ePrd } = await ensureProductionOrderForSales(
    admin,
    { tenantId, userId: user.id },
    {
      id: so.id,
      order_number: so.order_number,
      client_name: so.client_name,
      client_document: so.client_document,
      expected_delivery: so.expected_delivery,
    }
  );
  if (ePrd) {
    await rollbackSalesOrderCreation(admin, tenantId, so.id);
    return apiError("Erro ao gerar produção: " + ePrd, 500);
  }

  const { data: fresh, error: fErr } = await admin
    .from("sales_orders")
    .select("*")
    .eq("id", so.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fErr || !fresh) {
    await rollbackSalesOrderCreation(admin, tenantId, so.id);
    return apiError("Erro ao recarregar pedido", 500);
  }

  const recv = await generateReceivablesForSalesOrder(admin, tenantId, {
    id: fresh.id,
    order_number: fresh.order_number,
    order_date: fresh.order_date,
    total: fresh.total,
    client_name: fresh.client_name,
    client_document: fresh.client_document,
    payment_installments: fresh.payment_installments,
    payment_days_to_first_due: fresh.payment_days_to_first_due,
    payment_days_between_installments: fresh.payment_days_between_installments,
  });
  if (recv.error) {
    await rollbackSalesOrderCreation(admin, tenantId, so.id);
    return apiError("Erro ao gerar contas a receber: " + recv.error, 500);
  }

  const { error: uqErr } = await admin
    .from("quotes")
    .update({
      status: "converted",
      converted_to_sale_id: so.id,
    })
    .eq("id", quoteId)
    .eq("tenant_id", tenantId);

  if (uqErr) {
    await rollbackSalesOrderCreation(admin, tenantId, so.id);
    return apiError(
      "Erro ao atualizar orçamento: " + uqErr.message,
      supabaseErrorToHttp(uqErr.code)
    );
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
    .eq("id", so.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (dErr) {
    return apiOk({
      data: fresh,
      warning: "Pedido criado; detalhe não recarregado: " + dErr.message,
    });
  }

  return apiOk({ data: detail }, 201);
}
