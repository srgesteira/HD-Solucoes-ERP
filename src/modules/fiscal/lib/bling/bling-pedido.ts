/**
 * Botão «Criar e actualizar pedido no Bling»:
 * cliente (CNPJ + endereço), produtos com NCM, pedido com itens/parcelas.
 * «Emitir nota» só gera a NF-e a partir deste pedido.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  createAndLinkBlingProduct,
  patchBlingProductNcm,
  resolveBlingCatalogForSalesOrder,
} from "@/modules/fiscal/lib/bling/bling-catalog";
import { blingGet, blingPost, blingPut } from "@/modules/fiscal/lib/bling/bling-client";
import {
  blingNfeNaturezaOperacao,
  buildBlingNfeObservacoes,
} from "@/modules/fiscal/lib/bling/bling-nfe-payload";
import { buildBlingNfeParcelas } from "@/modules/fiscal/lib/bling/bling-nfe-parcelas";
import {
  unwrapBlingData,
  unwrapBlingList,
} from "@/modules/fiscal/lib/bling/bling-nfe-status";
import { splitAmountInInstallments } from "@/modules/vendas/lib/sales/sales-flow";
import {
  deliveryAddressFromRow,
  formatDeliveryAddressOneLine,
} from "@/modules/vendas/lib/sales/sales-order-delivery-address";
import {
  fretePorContaFromShipping,
  parseBlingPedidoTransporte,
} from "@/modules/fiscal/lib/bling/bling-pedido-transporte";

type Admin = SupabaseClient<Database>;

export type BlingPedidoPrepareResult = {
  pedido_venda_id: number;
  contact_id: number;
  natureza_operacao_id: number | null;
  products_created: number;
  products_linked: number;
  created: boolean;
};

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Preço unitário líquido com precisão extra — o Bling arredonda a linha. */
function netUnitValor(quantity: number, lineNet: number): number {
  if (quantity <= 0) return 0;
  return Math.round((lineNet / quantity) * 1e6) / 1e6;
}

function readBlingPedidoTotal(payload: unknown): number | null {
  const data = unwrapBlingData(payload);
  if (!data) return null;
  for (const key of ["total", "valor"] as const) {
    const n = Number(data[key]);
    if (Number.isFinite(n) && n > 0) return roundMoney(n);
  }
  const itens = data.itens;
  if (!Array.isArray(itens)) return null;
  const sum = itens.reduce((acc, raw) => {
    if (!raw || typeof raw !== "object") return acc;
    const it = raw as Record<string, unknown>;
    const q = Number(it.quantidade);
    const v = Number(it.valor);
    if (!Number.isFinite(q) || !Number.isFinite(v)) return acc;
    return acc + q * v;
  }, 0);
  return sum > 0 ? roundMoney(sum) : null;
}

function isDefaultFlag(value: unknown): boolean {
  return value === 1 || value === "1" || value === true || value === "S";
}

async function resolveBlingFormaPagamentoId(
  admin: Admin,
  tenantId: string
): Promise<number> {
  const payload = await blingGet(admin, tenantId, "/formas-pagamentos?limite=100");
  const rows = unwrapBlingList(payload);
  if (!rows.length) {
    throw new Error(
      "Não há formas de pagamento no Bling. Cadastre uma (ex.: Boleto ou A prazo) em Cadastros → Formas de pagamento."
    );
  }
  const scored = rows
    .map((row) => {
      const id = Number(row.id);
      const desc = String(row.descricao ?? "").toLowerCase();
      const tipo = Number(row.tipoPagamento);
      let score = 0;
      if (isDefaultFlag(row.padrao)) score += 50;
      if (/boleto/.test(desc)) score += 30;
      if (/duplicata|a prazo|parcel/.test(desc)) score += 24;
      if (tipo === 15) score += 20;
      if (tipo === 14) score += 16;
      if (tipo === 17) score += 10;
      return { id, score };
    })
    .filter((row) => Number.isFinite(row.id));
  scored.sort((a, b) => b.score - a.score);
  const id = scored[0]?.id;
  if (!id) {
    throw new Error("Não foi possível escolher uma forma de pagamento no Bling.");
  }
  return id;
}

async function resolveBlingNaturezaId(
  admin: Admin,
  tenantId: string,
  cfops: string[],
  docType: InvoiceDocumentType
): Promise<number | null> {
  const payload = await blingGet(
    admin,
    tenantId,
    "/naturezas-operacoes?limite=100"
  );
  const rows = unwrapBlingList(payload);
  if (!rows.length) return null;
  const needle =
    docType === "nfe_industrialization" ? /industrial/i : /venda/i;
  const scored = rows
    .map((row) => {
      const id = Number(row.id);
      const desc = String(row.descricao ?? "");
      let score = 0;
      if (isDefaultFlag(row.padrao)) score += 20;
      if (needle.test(desc)) score += 30;
      for (const cfop of cfops) {
        if (cfop && desc.includes(cfop)) score += 80;
      }
      return { id, score };
    })
    .filter((row) => Number.isFinite(row.id));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].id : scored[0]?.id ?? null;
}

export async function ensureBlingPedidoForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  docType: InvoiceDocumentType
): Promise<BlingPedidoPrepareResult> {
  const db = asUntypedAdmin(admin);
  const catalog = await resolveBlingCatalogForSalesOrder(
    admin,
    tenantId,
    salesOrderId
  );
  if (!catalog.contactId) {
    throw new Error("Não foi possível vincular o cliente no Bling (CNPJ/CPF).");
  }

  const { data: soRaw, error: soErr } = await db
    .from("sales_orders")
    .select(
      "order_number, order_date, client_name, customer_po_number, discount, total, payment_installments, payment_days_to_first_due, payment_days_between_installments, expected_delivery, actual_delivery, delivery_address_different, delivery_street, delivery_number, delivery_complement, delivery_neighborhood, delivery_city, delivery_state, delivery_zip, bling_pedido_venda_id, quote_id"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
  if (!soRaw) throw new Error("Pedido não encontrado.");
  const so = soRaw as {
    order_number: string;
    order_date: string;
    client_name: string;
    customer_po_number: string | null;
    discount: number | null;
    total: number | null;
    payment_installments: number | null;
    payment_days_to_first_due: number | null;
    payment_days_between_installments: number | null;
    expected_delivery: string | null;
    actual_delivery: string | null;
    delivery_address_different: boolean | null;
    delivery_street: string | null;
    delivery_number: string | null;
    delivery_complement: string | null;
    delivery_neighborhood: string | null;
    delivery_city: string | null;
    delivery_state: string | null;
    delivery_zip: string | null;
    bling_pedido_venda_id: number | null;
    quote_id: string | null;
  };

  let shippingType: string | null = null;
  let freightCost = 0;
  let carrierName: string | null = null;
  const { data: soExtra } = await db
    .from("sales_orders")
    .select("shipping_type, freight_cost, carrier_name")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soExtra && typeof soExtra === "object") {
    const extra = soExtra as {
      shipping_type?: string | null;
      freight_cost?: number | null;
      carrier_name?: string | null;
    };
    shippingType = extra.shipping_type ?? null;
    freightCost = Number(extra.freight_cost ?? 0);
    carrierName = extra.carrier_name?.trim() || null;
  }
  if ((!shippingType || freightCost <= 0) && so.quote_id) {
    const { data: quoteRow } = await db
      .from("quotes")
      .select("shipping_type, freight_cost")
      .eq("id", so.quote_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const q = quoteRow as {
      shipping_type?: string | null;
      freight_cost?: number | null;
    } | null;
    if (!shippingType) shippingType = q?.shipping_type ?? null;
    if (freightCost <= 0) freightCost = Number(q?.freight_cost ?? 0);
  }

  const { data: itemRows, error: itemsErr } = await db
    .from("sales_order_items")
    .select(
      "id, product_id, description, quantity, unit, unit_price, discount, product:products!sales_order_items_product_id_fkey(id, code, technical_code, name, unit, ncm, bling_product_id)"
    )
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId)
    .order("line_number", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  const lineIds = (itemRows ?? []).map((raw: { id?: string }) =>
    String(raw.id ?? "")
  );
  const cfopByLine = new Map<string, string>();
  if (lineIds.length) {
    const { data: apps } = await db
      .from("fiscal_rule_applications")
      .select(
        "document_line_id, applied_at, output_snapshot, fiscal_rule:fiscal_rules(cfop)"
      )
      .eq("tenant_id", tenantId)
      .eq("document_type", "sales_order_item")
      .in("document_line_id", lineIds);
    const latest = new Map<string, { at: string; cfop: string | null }>();
    for (const raw of apps ?? []) {
      const row = raw as {
        document_line_id: string;
        applied_at: string;
        output_snapshot: { cfop?: unknown } | null;
        fiscal_rule?: { cfop?: string | null } | { cfop?: string | null }[] | null;
      };
      const prev = latest.get(row.document_line_id);
      if (prev && prev.at > row.applied_at) continue;
      const rule = Array.isArray(row.fiscal_rule)
        ? row.fiscal_rule[0]
        : row.fiscal_rule;
      const fromSnap =
        typeof row.output_snapshot?.cfop === "string"
          ? row.output_snapshot.cfop
          : null;
      const cfop = (fromSnap || rule?.cfop || "").replace(/\D/g, "");
      latest.set(row.document_line_id, {
        at: row.applied_at,
        cfop: cfop.length === 4 ? cfop : null,
      });
    }
    for (const [id, v] of latest) {
      if (v.cfop) cfopByLine.set(id, v.cfop);
    }
  }

  let productsCreated = 0;
  let productsLinked = 0;
  const lineInputs: Array<{
    productId: string | null;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    discount: number;
    ncm: string | null;
    cfop: string | null;
    blingProductId: number | null;
    codigo: string;
    name: string;
  }> = [];

  for (const raw of itemRows ?? []) {
    const it = raw as {
      id: string;
      product_id: string | null;
      description: string;
      quantity: number;
      unit: string;
      unit_price: number;
      discount: number | null;
      product?:
        | {
            id: string;
            code: string | null;
            technical_code: string | null;
            name: string;
            unit: string | null;
            ncm: string | null;
            bling_product_id: number | null;
          }
        | Array<{
            id: string;
            code: string | null;
            technical_code: string | null;
            name: string;
            unit: string | null;
            ncm: string | null;
            bling_product_id: number | null;
          }>
        | null;
    };
    const product = Array.isArray(it.product) ? it.product[0] : it.product;
    if (!product?.id) {
      throw new Error(
        `Item sem produto de catálogo: ${it.description}. Vincule um SKU antes de preparar no Bling.`
      );
    }
    const before = product.bling_product_id
      ? Number(product.bling_product_id)
      : catalog.mappedProductIds.get(product.id) ?? null;
    const linked = await createAndLinkBlingProduct(admin, tenantId, product.id);
    if (linked.created) productsCreated += 1;
    else productsLinked += 1;
    if (!before && linked.bling_product_id) {
      await patchBlingProductNcm(
        admin,
        tenantId,
        linked.bling_product_id,
        product.ncm
      );
    }
    lineInputs.push({
      productId: product.id,
      description: it.description,
      quantity: Number(it.quantity ?? 0),
      unit: it.unit || product.unit || "UN",
      unit_price: Number(it.unit_price ?? 0),
      discount: Number(it.discount ?? 0),
      ncm: product.ncm,
      cfop: cfopByLine.get(String(it.id)) ?? null,
      blingProductId: linked.bling_product_id,
      codigo: linked.codigo,
      name: product.name,
    });
  }

  const cfops = [
    ...new Set(
      lineInputs
        .map((it) => String(it.cfop ?? "").replace(/\D/g, ""))
        .filter((c) => c.length === 4)
    ),
  ];
  const [formaPagamentoId, naturezaId] = await Promise.all([
    resolveBlingFormaPagamentoId(admin, tenantId),
    resolveBlingNaturezaId(admin, tenantId, cfops, docType),
  ]);

  // No Bling, `desconto` (item e cabeçalho) é percentual por omissão.
  // Os descontos do ERP são em R$ — embutir no preço unitário e não enviar `desconto`.
  const headerDiscount = roundMoney(Math.max(0, Number(so.discount ?? 0)));
  const lineNets = lineInputs.map((it) => {
    const gross = roundMoney(it.quantity * it.unit_price);
    return roundMoney(Math.max(0, gross - Math.max(0, it.discount)));
  });
  let remainingHeader = headerDiscount;
  for (let i = lineNets.length - 1; i >= 0 && remainingHeader > 0; i -= 1) {
    const take = Math.min(lineNets[i], remainingHeader);
    lineNets[i] = roundMoney(lineNets[i] - take);
    remainingHeader = roundMoney(remainingHeader - take);
  }
  const netTotal = roundMoney(lineNets.reduce((acc, n) => acc + n, 0));
  if (netTotal <= 0) {
    throw new Error(
      "O total líquido do pedido ficou zerado ou negativo depois dos descontos. Ajuste o pedido antes de preparar no Bling."
    );
  }

  const itens = lineInputs.map((it, i) => ({
    codigo: it.codigo,
    descricao: it.name || it.description,
    unidade: it.unit || "UN",
    quantidade: it.quantity,
    valor: netUnitValor(it.quantity, lineNets[i] ?? 0),
    produto: { id: it.blingProductId as number },
  }));

  const paymentSource = {
    order_number: so.order_number,
    customer_po_number: so.customer_po_number,
    payment_installments: Number(so.payment_installments ?? 1),
    payment_days_to_first_due: Number(so.payment_days_to_first_due ?? 30),
    payment_days_between_installments: Number(
      so.payment_days_between_installments ?? 0
    ),
    expected_delivery: so.expected_delivery,
    actual_delivery: so.actual_delivery,
    order_date: so.order_date,
    total: netTotal,
  };
  const nfeParcelas = buildBlingNfeParcelas(paymentSource);
  const orderDate = String(so.order_date ?? "").slice(0, 10);
  const dataPrevista = String(
    so.expected_delivery ?? so.actual_delivery ?? so.order_date ?? ""
  ).slice(0, 10);

  const payloadBase = {
    data: orderDate,
    dataSaida: orderDate,
    dataPrevista: dataPrevista || orderDate,
    contato: { id: catalog.contactId },
    numeroLoja: so.order_number,
    observacoes: buildBlingNfeObservacoes(
      {
        order_number: so.order_number,
        customer_po_number: so.customer_po_number,
        delivery_address_formatted: formatDeliveryAddressOneLine(
          deliveryAddressFromRow(so)
        ),
      },
      salesOrderId
    ),
    observacoesInternas: `CFOP conferência: ${cfops.join(", ") || "—"}. Natureza ERP: ${blingNfeNaturezaOperacao(docType)}.`,
    itens,
    transporte: {
      fretePorConta: fretePorContaFromShipping(shippingType),
      ...(freightCost > 0 ? { frete: roundMoney(freightCost) } : {}),
      ...(carrierName ? { contato: { nome: carrierName } } : {}),
    },
  };

  let pedidoId = so.bling_pedido_venda_id
    ? Number(so.bling_pedido_venda_id)
    : null;
  let created = false;

  if (pedidoId && Number.isFinite(pedidoId)) {
    try {
      await blingGet(admin, tenantId, `/pedidos/vendas/${pedidoId}`);
      await blingPut(admin, tenantId, `/pedidos/vendas/${pedidoId}`, payloadBase);
    } catch {
      pedidoId = null;
    }
  }

  if (!pedidoId) {
    const createdPayload = await blingPost(
      admin,
      tenantId,
      "/pedidos/vendas",
      payloadBase
    );
    const id = Number(unwrapBlingData(createdPayload)?.id);
    if (!Number.isFinite(id)) {
      throw new Error("Bling criou o pedido mas não devolveu o ID.");
    }
    pedidoId = id;
    created = true;
  }

  const fetched = await blingGet(admin, tenantId, `/pedidos/vendas/${pedidoId}`);
  const blingTotal = readBlingPedidoTotal(fetched) ?? netTotal;
  const mirrored = parseBlingPedidoTransporte(fetched);
  const amounts = splitAmountInInstallments(blingTotal, nfeParcelas.length);
  try {
    await blingPut(admin, tenantId, `/pedidos/vendas/${pedidoId}`, {
      ...payloadBase,
      parcelas: nfeParcelas.map((p, i) => ({
        dataVencimento: p.data,
        valor: amounts[i],
        observacoes: p.observacoes,
        formaPagamento: { id: formaPagamentoId },
      })),
    });
  } catch {
    // Pedido já gravado; o Bling gera parcelas iguais ao total se as nossas forem recusadas.
  }

  const { error: saveErr } = await db
    .from("sales_orders")
    .update({
      bling_pedido_venda_id: pedidoId,
      bling_pedido_prepared_at: new Date().toISOString(),
      bling_natureza_operacao_id: naturezaId,
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (saveErr) {
    throw new Error(
      `Pedido criado no Bling (#${pedidoId}), mas o ERP não gravou o vínculo: ${saveErr.message}`
    );
  }

  const { error: mirrorErr } = await db
    .from("sales_orders")
    .update({
      shipping_type: mirrored.shipping_type ?? shippingType ?? null,
      freight_cost: mirrored.freight_cost > 0 ? mirrored.freight_cost : freightCost,
      carrier_name: mirrored.carrier_name ?? carrierName,
      freight_payer: mirrored.freight_payer,
    })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);
  if (
    mirrorErr &&
    !/shipping_type|freight_cost|carrier_name|freight_payer/i.test(mirrorErr.message)
  ) {
    throw new Error(mirrorErr.message);
  }

  return {
    pedido_venda_id: pedidoId,
    contact_id: catalog.contactId,
    natureza_operacao_id: naturezaId,
    products_created: productsCreated,
    products_linked: productsLinked,
    created,
  };
}
