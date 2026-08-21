/**
 * Emissão de NF-e (modelo 55) via Bling.
 * Fluxo confirmado na referência v3: POST /nfe (cria rascunho) →
 * POST /nfe/{id}/enviar (autorização SEFAZ). Não é obrigatório criar
 * Pedido de Venda no Bling — o ERP permanece a fonte comercial.
 * @see https://developer.bling.com.br/referencia
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import { BlingApiError } from "@/modules/fiscal/lib/bling/bling-errors";
import { blingGet, blingPost } from "@/modules/fiscal/lib/bling/bling-client";
import { resolveBlingCatalogForSalesOrder } from "@/modules/fiscal/lib/bling/bling-catalog";
import {
  parseBlingNfeSnapshot,
  unwrapBlingData,
} from "@/modules/fiscal/lib/bling/bling-nfe-status";
import { applyBlingNfeSnapshot } from "@/modules/fiscal/lib/bling/bling-apply-status";
import { searchBlingNfeForErpOrder } from "@/modules/fiscal/lib/bling/bling-reconcile";
import { buildBlingNfeParcelas } from "@/modules/fiscal/lib/bling/bling-nfe-parcelas";
import {
  blingNfeNaturezaOperacao,
  buildBlingNfeObservacoes,
} from "@/modules/fiscal/lib/bling/bling-nfe-payload";
import {
  deliveryAddressFromRow,
  formatDeliveryAddressOneLine,
} from "@/modules/vendas/lib/sales/sales-order-delivery-address";

type Admin = SupabaseClient<Database>;

type NfeRow = {
  id: string;
  status: string;
  bling_nfe_id: number | null;
  external_started_at: string | null;
  sales_order_id: string | null;
  error_message: string | null;
};

async function loadClaimedNfe(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<NfeRow> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("nfes")
    .select("id, status, bling_nfe_id, external_started_at, sales_order_id, error_message")
    .eq("id", nfeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Registo de NF-e não encontrado.");
  return data as NfeRow;
}

async function syncExistingBlingNfe(
  admin: Admin,
  tenantId: string,
  nfeId: string,
  blingNfeId: number
): Promise<void> {
  const payload = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
  let snapshot = parseBlingNfeSnapshot(payload, blingNfeId);
  if (snapshot.status === "pending" || snapshot.status === "processing") {
    try {
      await blingPost(admin, tenantId, `/nfe/${blingNfeId}/enviar`);
      const again = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
      snapshot = parseBlingNfeSnapshot(again, blingNfeId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao enviar NF-e à SEFAZ.";
      await applyBlingNfeSnapshot(admin, tenantId, nfeId, snapshot, {
        error_message: msg,
      });
      throw e;
    }
  }
  await applyBlingNfeSnapshot(admin, tenantId, nfeId, snapshot);
}

export async function emitirNfeViaBling(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  docType: InvoiceDocumentType
): Promise<{ nfe_id: string; bling_nfe_id: number | null }> {
  const gate = await validateSalesOrderCanEmitNfe(admin, tenantId, salesOrderId);
  if (!gate.ok) {
    throw new Error(gate.reasons.join(" "));
  }

  const db = asUntypedAdmin(admin);
  const idempotencyKey = `bling-nfe:${salesOrderId}`;
  const { data: claimed, error: claimErr } = await db.rpc(
    "fn_bling_claim_nfe_emit",
    {
      p_tenant_id: tenantId,
      p_sales_order_id: salesOrderId,
      p_idempotency_key: idempotencyKey,
    }
  );
  if (claimErr) throw new Error(claimErr.message);
  const claimedRow = claimed as NfeRow | NfeRow[] | null;
  const nfe = Array.isArray(claimedRow) ? claimedRow[0] : claimedRow;
  if (!nfe?.id) throw new Error("Não foi possível abrir o registo local da NF-e.");

  if (nfe.status === "authorized" && nfe.bling_nfe_id) {
    return { nfe_id: nfe.id, bling_nfe_id: nfe.bling_nfe_id };
  }

  if (nfe.bling_nfe_id) {
    await syncExistingBlingNfe(admin, tenantId, nfe.id, Number(nfe.bling_nfe_id));
    const latest = await loadClaimedNfe(admin, tenantId, nfe.id);
    return { nfe_id: latest.id, bling_nfe_id: latest.bling_nfe_id };
  }

  const catalog = await resolveBlingCatalogForSalesOrder(
    admin,
    tenantId,
    salesOrderId
  );
  if (!catalog.contactId) {
    await db
      .from("nfes")
      .update({
        status: "error",
        error_message: "Não foi possível vincular o cliente no Bling (CNPJ/CPF).",
        reconcile_needed: false,
      })
      .eq("id", nfe.id)
      .eq("tenant_id", tenantId);
    throw new Error("Não foi possível vincular o cliente no Bling (CNPJ/CPF).");
  }
  if (catalog.unmappedProducts.length > 0) {
    const list = catalog.unmappedProducts
      .map((p) => p.code || p.technical_code || p.name)
      .join(", ");
    const msg = `Produto(s) sem correspondente no Bling: ${list}. Cadastre o SKU no Bling (com NCM/CFOP/CSOSN) e sincronize.`;
    await db
      .from("nfes")
      .update({
        status: "error",
        error_message: msg,
        reconcile_needed: false,
      })
      .eq("id", nfe.id)
      .eq("tenant_id", tenantId);
    throw new Error(msg);
  }

  if (nfe.external_started_at && !nfe.bling_nfe_id) {
    const found = await searchBlingNfeForErpOrder(
      admin,
      tenantId,
      salesOrderId,
      catalog.contactId
    );
    if (found) {
      await applyBlingNfeSnapshot(admin, tenantId, nfe.id, found, {
        reconcile_needed: false,
      });
      if (found.bling_nfe_id) {
        await syncExistingBlingNfe(admin, tenantId, nfe.id, found.bling_nfe_id);
      }
      const latest = await loadClaimedNfe(admin, tenantId, nfe.id);
      return { nfe_id: latest.id, bling_nfe_id: latest.bling_nfe_id };
    }
    await db
      .from("nfes")
      .update({
        status: "error",
        reconcile_needed: true,
        error_message:
          "Emissão anterior pode ter sido criada no Bling sem retorno no ERP. Use «Sincronizar» / reconciliação antes de reemitir.",
      })
      .eq("id", nfe.id)
      .eq("tenant_id", tenantId);
    throw new Error(
      "Há uma emissão Bling em estado inconsistente. Sincronize o status antes de tentar de novo."
    );
  }

  const { data: soRaw, error: soErr } = await db
    .from("sales_orders")
    .select(
      "order_number, order_date, client_name, customer_po_number, discount, total, payment_installments, payment_days_to_first_due, payment_days_between_installments, expected_delivery, actual_delivery, delivery_address_different, delivery_street, delivery_number, delivery_complement, delivery_neighborhood, delivery_city, delivery_state, delivery_zip"
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (soErr) throw new Error(soErr.message);
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
  };

  const { data: itemRows, error: itemsErr } = await db
    .from("sales_order_items")
    .select(
      "id, product_id, description, quantity, unit, unit_price, discount, product:products!sales_order_items_product_id_fkey(id, code, name, bling_product_id)"
    )
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId)
    .order("line_number", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  const itens = (itemRows ?? []).map((raw: unknown) => {
    const it = raw as {
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
            name: string;
            bling_product_id: number | null;
          }
        | Array<{
            id: string;
            code: string | null;
            name: string;
            bling_product_id: number | null;
          }>
        | null;
    };
    const product = Array.isArray(it.product) ? it.product[0] : it.product;
    const blingId =
      (product?.id ? catalog.mappedProductIds.get(product.id) : null) ??
      (product?.bling_product_id ? Number(product.bling_product_id) : null);
    return {
      codigo: product?.code ?? undefined,
      descricao: product?.name ?? it.description,
      unidade: it.unit || "UN",
      quantidade: Number(it.quantity ?? 0),
      valor: Number(it.unit_price ?? 0),
      desconto: Number(it.discount ?? 0) || undefined,
      tipo: "P",
      produto: blingId ? { id: blingId } : undefined,
    };
  });

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
    total: Number(so.total ?? 0),
  };

  const observacoes = buildBlingNfeObservacoes(
    {
      order_number: so.order_number,
      customer_po_number: so.customer_po_number,
      delivery_address_formatted: formatDeliveryAddressOneLine(
        deliveryAddressFromRow(so)
      ),
    },
    salesOrderId
  );

  const payload = {
    tipo: 1,
    finalidade: 1,
    naturezaOperacao: blingNfeNaturezaOperacao(docType),
    data: String(so.order_date ?? new Date().toISOString()).slice(0, 10),
    contato: { id: catalog.contactId },
    itens,
    desconto: Number(so.discount ?? 0) || undefined,
    observacoes,
    /** Grupo fatura/duplicata da NF-e (cobrança estruturada, não infCpl). */
    parcelas: buildBlingNfeParcelas(paymentSource),
  };

  await db
    .from("nfes")
    .update({
      status: "processing",
      external_started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", nfe.id)
    .eq("tenant_id", tenantId);

  let blingNfeId: number;
  try {
    const created = await blingPost(admin, tenantId, "/nfe", payload);
    const data = unwrapBlingData(created);
    const id = Number(data?.id);
    if (!Number.isFinite(id)) {
      throw new Error("Bling criou a nota mas não devolveu o ID.");
    }
    blingNfeId = id;
  } catch (e) {
    const msg =
      e instanceof BlingApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Falha ao criar NF-e no Bling.";
    await db
      .from("nfes")
      .update({
        status: "error",
        reconcile_needed: true,
        error_message: msg,
      })
      .eq("id", nfe.id)
      .eq("tenant_id", tenantId);
    throw e;
  }

  try {
    await db
      .from("nfes")
      .update({
        bling_nfe_id: blingNfeId,
        reconcile_needed: false,
      })
      .eq("id", nfe.id)
      .eq("tenant_id", tenantId);
  } catch {
    // Nota existe no Bling — reconciliação pelo ID se o update falhar no retry.
  }

  try {
    await blingPost(admin, tenantId, `/nfe/${blingNfeId}/enviar`);
  } catch (e) {
    const snapshot = parseBlingNfeSnapshot(
      await blingGet(admin, tenantId, `/nfe/${blingNfeId}`).catch(() => ({
        data: { id: blingNfeId },
      })),
      blingNfeId
    );
    const msg = e instanceof Error ? e.message : "Falha ao enviar NF-e à SEFAZ.";
    await applyBlingNfeSnapshot(admin, tenantId, nfe.id, snapshot, {
      error_message: msg,
      reconcile_needed: snapshot.status !== "authorized",
    });
    throw e;
  }

  const after = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
  const snapshot = parseBlingNfeSnapshot(after, blingNfeId);
  await applyBlingNfeSnapshot(admin, tenantId, nfe.id, snapshot);
  return { nfe_id: nfe.id, bling_nfe_id: blingNfeId };
}

export async function consultarNfeViaBling(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<void> {
  const row = await loadClaimedNfe(admin, tenantId, nfeId);
  if (row.bling_nfe_id) {
    await syncExistingBlingNfe(admin, tenantId, nfeId, Number(row.bling_nfe_id));
    return;
  }
  if (!row.sales_order_id) {
    throw new Error("NF-e Bling sem ID remoto — reconciliação necessária.");
  }
  const catalog = await resolveBlingCatalogForSalesOrder(
    admin,
    tenantId,
    row.sales_order_id
  );
  const found = catalog.contactId
    ? await searchBlingNfeForErpOrder(
        admin,
        tenantId,
        row.sales_order_id,
        catalog.contactId
      )
    : null;
  if (!found) {
    const db = asUntypedAdmin(admin);
    await db
      .from("nfes")
      .update({
        reconcile_needed: true,
        error_message:
          row.error_message ??
          "Nota local sem ID Bling. Confirme no Bling e volte a sincronizar.",
      })
      .eq("id", nfeId)
      .eq("tenant_id", tenantId);
    throw new Error(
      "Não foi encontrada a NF-e correspondente no Bling. Verifique no painel do Bling."
    );
  }
  await applyBlingNfeSnapshot(admin, tenantId, nfeId, found);
}

export async function cancelarNfeViaBling(
  admin: Admin,
  tenantId: string,
  nfeId: string,
  justificativa: string
): Promise<void> {
  const row = await loadClaimedNfe(admin, tenantId, nfeId);
  if (!row.bling_nfe_id) {
    throw new Error("NF-e sem ID Bling — não é possível cancelar.");
  }
  await blingPost(admin, tenantId, `/nfe/${row.bling_nfe_id}/cancelar`, {
    justificativa: justificativa.trim(),
  });
  const after = await blingGet(admin, tenantId, `/nfe/${row.bling_nfe_id}`);
  const snapshot = parseBlingNfeSnapshot(after, Number(row.bling_nfe_id));
  await applyBlingNfeSnapshot(admin, tenantId, nfeId, snapshot);
}
