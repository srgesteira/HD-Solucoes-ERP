import type { AdminClient, SaleLineInput } from "@/modules/vendas/lib/sales/sales-flow";
import {
  addDaysToISODate,
  generateReceivablesForSalesOrder,
  insertSalesOrderItemsFromLines,
  nextSalesOrderNumber,
  rollbackSalesOrderCreation,
} from "@/modules/vendas/lib/sales/sales-flow";
import { fetchCustomerForTenant } from "@/modules/vendas/lib/sales/quote-customer";
import { applyFiscalToSalesOrderItems } from "@/modules/fiscal/lib/fiscal-rules-service";

export type ConvertQuoteOptions = {
  payment_installments?: number;
  payment_days_to_first_due?: number;
  payment_days_between_installments?: number;
};

export type ConvertQuoteResult =
  | { ok: true; salesOrderId: string; orderNumber: string }
  | { ok: false; message: string; status: number };

/**
 * Converte orçamento aprovado em pedido de venda (status do orçamento → converted).
 */
export async function convertQuoteToSalesOrder(
  admin: AdminClient,
  tenantId: string,
  quoteId: string,
  userId: string,
  opts: ConvertQuoteOptions = {}
): Promise<ConvertQuoteResult> {
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
    return {
      ok: false,
      message: "Erro ao buscar orçamento: " + qErr.message,
      status: 500,
    };
  }
  if (!quote) {
    return { ok: false, message: "Orçamento não encontrado", status: 404 };
  }

  const quoteRow = quote as Record<string, unknown>;
  const installments = Math.max(
    1,
    opts.payment_installments ??
      (typeof quoteRow.payment_installments === "number"
        ? quoteRow.payment_installments
        : 1)
  );
  const daysFirst =
    opts.payment_days_to_first_due ??
    (typeof quoteRow.payment_days_to_first_due === "number"
      ? quoteRow.payment_days_to_first_due
      : 30);
  const daysBetween =
    opts.payment_days_between_installments ??
    (typeof quoteRow.payment_days_between_installments === "number"
      ? quoteRow.payment_days_between_installments
      : 30);

  const order_date = new Date().toISOString().slice(0, 10);

  const expectedDelivery =
    typeof quoteRow.expected_delivery_date === "string" &&
    quoteRow.expected_delivery_date.trim()
      ? String(quoteRow.expected_delivery_date).slice(0, 10)
      : addDaysToISODate(order_date, 30);

  if (quote.status !== "approved" && quote.status !== "converted") {
    return {
      ok: false,
      message: "Apenas orçamentos aprovados podem gerar pedido de venda",
      status: 400,
    };
  }

  if (quote.converted_to_sale_id) {
    return {
      ok: false,
      message: "Orçamento já convertido em pedido de venda",
      status: 409,
    };
  }

  const rawItems =
    quote.items as unknown as Array<Record<string, unknown>> | null;
  if (!rawItems?.length) {
    return {
      ok: false,
      message: "Orçamento não possui itens para converter",
      status: 400,
    };
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
      usage_type:
        it.usage_type === "consumo" ||
        it.usage_type === "materia_prima" ||
        it.usage_type === "revenda"
          ? it.usage_type
          : null,
    });
  }

  const order_number = await nextSalesOrderNumber(admin, tenantId);

  let clientDocument: string | null = null;
  let clientPhone: string | null = null;
  let clientAddress: string | null = null;
  const customerId =
    typeof quote.customer_id === "string" ? quote.customer_id : null;
  if (customerId) {
    const cust = await fetchCustomerForTenant(admin, tenantId, customerId);
    if (cust) {
      clientDocument = cust.document;
      clientPhone = cust.phone;
      clientAddress = cust.address;
    }
  }

  const { data: so, error: soErr } = await admin
    .from("sales_orders")
    .insert({
      tenant_id: tenantId,
      order_number,
      quote_id: quoteId,
      client_name: quote.client_name,
      client_document: clientDocument,
      client_email: quote.client_email,
      client_phone: clientPhone,
      client_address: clientAddress,
      order_date,
      expected_delivery: expectedDelivery,
      status: "pending",
      discount: quote.discount,
      tax: quote.tax,
      notes: quote.notes,
      created_by: userId || null,
      payment_installments: installments,
      payment_days_to_first_due: daysFirst,
      payment_days_between_installments: daysBetween,
      mrp_processed: false,
    } as never)
    .select()
    .single();

  if (soErr?.code === "23505") {
    return { ok: false, message: "Número do pedido já existe", status: 409 };
  }
  if (soErr || !so) {
    return {
      ok: false,
      message: "Erro ao criar pedido de venda: " + (soErr?.message ?? ""),
      status: 500,
    };
  }

  const ins = await insertSalesOrderItemsFromLines(
    admin,
    tenantId,
    so.id,
    lines
  );
  if (ins.error) {
    await admin.from("sales_orders").delete().eq("id", so.id).eq("tenant_id", tenantId);
    return { ok: false, message: "Erro ao copiar itens: " + ins.error, status: 500 };
  }

  const { data: fresh, error: fErr } = await admin
    .from("sales_orders")
    .select("*")
    .eq("id", so.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fErr || !fresh) {
    await rollbackSalesOrderCreation(admin, tenantId, so.id);
    return { ok: false, message: "Erro ao recarregar pedido", status: 500 };
  }

  const recv = await generateReceivablesForSalesOrder(
    admin,
    tenantId,
    {
      id: fresh.id,
      order_number: fresh.order_number,
      order_date: fresh.order_date,
      total: fresh.total,
      client_name: fresh.client_name,
      client_document: fresh.client_document,
      payment_installments: fresh.payment_installments,
      payment_days_to_first_due: fresh.payment_days_to_first_due,
      payment_days_between_installments: fresh.payment_days_between_installments,
    },
    { provisional: true }
  );
  if (recv.error) {
    await rollbackSalesOrderCreation(admin, tenantId, so.id);
    return {
      ok: false,
      message: "Erro ao gerar contas a receber: " + recv.error,
      status: 500,
    };
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
    return {
      ok: false,
      message: "Erro ao atualizar orçamento: " + uqErr.message,
      status: 500,
    };
  }

  // §7.1: dispara o motor fiscal na efetivação para sinalizar o
  // faturamento desde já. Falhas aqui não bloqueiam o pedido — o estado
  // fiscal pode ser revisitado manualmente.
  try {
    await applyFiscalToSalesOrderItems(admin, tenantId, so.id, userId || null);
  } catch (err) {
    console.error(
      "[fiscal] Falha ao aplicar regras na efetivação do PV " + so.id,
      err
    );
  }

  return {
    ok: true,
    salesOrderId: so.id,
    orderNumber: so.order_number,
  };
}
