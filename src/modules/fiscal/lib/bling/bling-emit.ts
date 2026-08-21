/**
 * Emissão de NF-e (modelo 55) via Bling.
 *
 * Nunca apaga pedido nem NF-e no Bling. Rejeitada: corrige CSOSN/número
 * na mesma nota e reenvia. O número segue a última autorizada + 1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { getFiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import { BlingApiError } from "@/modules/fiscal/lib/bling/bling-errors";
import {
  blingGet,
  blingPost,
  blingPut,
} from "@/modules/fiscal/lib/bling/bling-client";
import {
  BLING_NFE_SITUACAO,
  mapBlingSituacaoToDb,
  parseBlingNfeSnapshot,
  unwrapBlingData,
  unwrapBlingList,
  type NfeDbStatus,
} from "@/modules/fiscal/lib/bling/bling-nfe-status";
import { applyBlingNfeSnapshot } from "@/modules/fiscal/lib/bling/bling-apply-status";
import { searchBlingNfeForErpOrder } from "@/modules/fiscal/lib/bling/bling-reconcile";
import { resolveBlingCatalogForSalesOrder } from "@/modules/fiscal/lib/bling/bling-catalog";
import { ensureBlingPedidoForSalesOrder } from "@/modules/fiscal/lib/bling/bling-pedido";
import { readBlingPedidoNotaFiscalId } from "@/modules/fiscal/lib/bling/bling-pedido-transporte";
import {
  applyNaoContribuinteCsosnToNfeData,
  buildBlingNfeCreateBody,
  fiscalReviewToBlingNfeCreateInput,
  isConsumidorFinal,
} from "@/modules/fiscal/lib/bling/bling-nfe-payload";

type Admin = SupabaseClient<Database>;

type NfeRow = {
  id: string;
  status: string;
  bling_nfe_id: number | null;
  nfe_number: string | null;
  external_started_at: string | null;
  sales_order_id: string | null;
  error_message: string | null;
};

function blingNfeNumeroField(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").trim();
  return s || null;
}

function nfeNumeroSortValue(value: unknown): number | null {
  const raw =
    typeof value === "number" && Number.isFinite(value)
      ? String(Math.trunc(value))
      : String(value ?? "").replace(/\D/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type RemoteNfeIdentity = {
  numero: string | number | null;
  serie: string | number | null;
  status: NfeDbStatus;
};

async function loadRemoteNfeIdentity(
  admin: Admin,
  tenantId: string,
  blingNfeId: number
): Promise<RemoteNfeIdentity | null> {
  try {
    const payload = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
    const data = unwrapBlingData(payload);
    if (!data) return null;
    return {
      numero: blingNfeNumeroField(data.numero),
      serie: blingNfeNumeroField(data.serie),
      status: mapBlingSituacaoToDb(data.situacao),
    };
  } catch (e) {
    if (e instanceof BlingApiError && (e.status === 404 || e.status === 410)) {
      return null;
    }
    throw e;
  }
}

function formatNfeNumero(n: number): string {
  return String(Math.trunc(n)).padStart(6, "0");
}

async function lastAuthorizedNfeNumero(
  admin: Admin,
  tenantId: string
): Promise<number> {
  let max = 0;
  const situacoes = [
    BLING_NFE_SITUACAO.AUTORIZADA,
    BLING_NFE_SITUACAO.EMITIDA_DANFE,
    BLING_NFE_SITUACAO.REGISTRADA,
  ];
  for (const situacao of situacoes) {
    const qs = new URLSearchParams({
      tipo: "1",
      situacao: String(situacao),
      limite: "100",
      pagina: "1",
    });
    const listed = await blingGet(admin, tenantId, `/nfe?${qs.toString()}`);
    for (const row of unwrapBlingList(listed)) {
      const n = nfeNumeroSortValue(row.numero);
      if (n != null && n > max) max = n;
    }
  }
  const db = asUntypedAdmin(admin);
  const { data } = await db
    .from("nfes")
    .select("nfe_number")
    .eq("tenant_id", tenantId)
    .eq("provider", "bling")
    .eq("status", "authorized");
  for (const row of (data ?? []) as Array<{ nfe_number: string | null }>) {
    const n = nfeNumeroSortValue(row.nfe_number);
    if (n != null && n > max) max = n;
  }
  return max;
}

function nfeBodyForPut(data: Record<string, unknown>): Record<string, unknown> {
  const {
    id: _id,
    situacao: _situacao,
    chaveAcesso: _chave,
    xml: _xml,
    linkDanfe: _danfe,
    linkXML: _linkXml,
    ...rest
  } = data;
  return rest;
}

async function rewriteBlingNfeDraft(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  blingNfeId: number,
  contactId: number,
  naturezaOperacaoId: number | null,
  numero: string
): Promise<void> {
  const review = await getFiscalOrderReview(admin, tenantId, salesOrderId);
  if (!review) {
    throw new Error("Pedido de venda não encontrado para montar a NF-e.");
  }
  const payload = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
  const existing = nfeBodyForPut(unwrapBlingData(payload) ?? {});
  const created = buildBlingNfeCreateBody(
    fiscalReviewToBlingNfeCreateInput(review, contactId)
  );
  const contatoExisting =
    existing.contato && typeof existing.contato === "object"
      ? (existing.contato as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = {
    ...existing,
    ...created,
    numero,
    contato: {
      ...contatoExisting,
      ...created.contato,
    },
    itens: created.itens,
    ...(naturezaOperacaoId
      ? { naturezaOperacao: { id: naturezaOperacaoId } }
      : {}),
  };
  await blingPut(
    admin,
    tenantId,
    `/nfe/${blingNfeId}`,
    applyNaoContribuinteCsosnToNfeData(merged)
  );
}

async function upsertSequentialNfe(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  pedidoVendaId: number,
  contactId: number,
  naturezaOperacaoId: number | null,
  numero: string,
  existingBlingNfeId: number | null
): Promise<number> {
  const candidates = new Set<number>();
  if (existingBlingNfeId && Number.isFinite(existingBlingNfeId)) {
    candidates.add(existingBlingNfeId);
  }
  try {
    const pedido = await blingGet(
      admin,
      tenantId,
      `/pedidos/vendas/${pedidoVendaId}`
    );
    const linked = readBlingPedidoNotaFiscalId(pedido);
    if (linked) candidates.add(linked);
  } catch (e) {
    if (!(e instanceof BlingApiError) || (e.status !== 404 && e.status !== 410)) {
      throw e;
    }
  }

  for (const id of candidates) {
    const remote = await loadRemoteNfeIdentity(admin, tenantId, id);
    if (!remote) continue;
    if (remote.status === "authorized" || remote.status === "processing") {
      return id;
    }
    try {
      await rewriteBlingNfeDraft(
        admin,
        tenantId,
        salesOrderId,
        id,
        contactId,
        naturezaOperacaoId,
        numero
      );
      return id;
    } catch {
      // Rejeitada pode recusar PUT; criamos outra nota sem apagar esta nem o pedido.
    }
  }

  const review = await getFiscalOrderReview(admin, tenantId, salesOrderId);
  if (!review) {
    throw new Error("Pedido de venda não encontrado para montar a NF-e.");
  }
  const body: Record<string, unknown> = applyNaoContribuinteCsosnToNfeData({
    ...buildBlingNfeCreateBody(
      fiscalReviewToBlingNfeCreateInput(review, contactId)
    ),
    numero,
    ...(naturezaOperacaoId
      ? { naturezaOperacao: { id: naturezaOperacaoId } }
      : {}),
  });
  const created = await blingPost(admin, tenantId, "/nfe", body);
  const id = Number(unwrapBlingData(created)?.id);
  if (!Number.isFinite(id)) {
    throw new Error("O Bling criou a NF-e mas não devolveu o ID.");
  }
  try {
    await rewriteBlingNfeDraft(
      admin,
      tenantId,
      salesOrderId,
      id,
      contactId,
      naturezaOperacaoId,
      numero
    );
  } catch {
    // Nota criada; o PUT do número/CSOSN corre no align seguinte.
  }
  return id;
}

async function alignBlingNfeCsosnIfConsumidorFinal(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  blingNfeId: number
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { data: itemRows } = await db
    .from("sales_order_items")
    .select("usage_type")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  const items = (itemRows ?? []) as Array<{ usage_type?: string | null }>;
  if (!isConsumidorFinal(items)) return;

  const payload = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
  const data = unwrapBlingData(payload);
  if (!data) return;
  const body = applyNaoContribuinteCsosnToNfeData(nfeBodyForPut(data));
  await blingPut(admin, tenantId, `/nfe/${blingNfeId}`, body);
}

async function loadClaimedNfe(
  admin: Admin,
  tenantId: string,
  nfeId: string
): Promise<NfeRow> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("nfes")
    .select("id, status, bling_nfe_id, nfe_number, external_started_at, sales_order_id, error_message")
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
    const remote = await loadRemoteNfeIdentity(
      admin,
      tenantId,
      Number(nfe.bling_nfe_id)
    );
    if (remote?.status === "authorized") {
      const payload = await blingGet(
        admin,
        tenantId,
        `/nfe/${nfe.bling_nfe_id}`
      );
      await applyBlingNfeSnapshot(
        admin,
        tenantId,
        nfe.id,
        parseBlingNfeSnapshot(payload, Number(nfe.bling_nfe_id))
      );
      return { nfe_id: nfe.id, bling_nfe_id: Number(nfe.bling_nfe_id) };
    }
    if (remote?.status === "processing") {
      await syncExistingBlingNfe(admin, tenantId, nfe.id, Number(nfe.bling_nfe_id));
      const latest = await loadClaimedNfe(admin, tenantId, nfe.id);
      return { nfe_id: latest.id, bling_nfe_id: latest.bling_nfe_id };
    }
  }

  let prepared: Awaited<ReturnType<typeof ensureBlingPedidoForSalesOrder>>;
  try {
    prepared = await ensureBlingPedidoForSalesOrder(
      admin,
      tenantId,
      salesOrderId,
      docType
    );
  } catch (e) {
    const msg =
      e instanceof BlingApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Falha ao preparar o pedido no Bling.";
    await db
      .from("nfes")
      .update({
        status: "error",
        reconcile_needed: false,
        error_message: msg,
      })
      .eq("id", nfe.id)
      .eq("tenant_id", tenantId);
    throw e;
  }

  if (nfe.external_started_at && !nfe.bling_nfe_id) {
    const found = await searchBlingNfeForErpOrder(
      admin,
      tenantId,
      salesOrderId,
      prepared.contact_id
    );
    if (found?.status === "authorized" || found?.status === "processing") {
      await applyBlingNfeSnapshot(admin, tenantId, nfe.id, found, {
        reconcile_needed: false,
      });
      if (found.bling_nfe_id) {
        await syncExistingBlingNfe(admin, tenantId, nfe.id, found.bling_nfe_id);
      }
      const latest = await loadClaimedNfe(admin, tenantId, nfe.id);
      return { nfe_id: latest.id, bling_nfe_id: latest.bling_nfe_id };
    }
  }

  const nextNumero = formatNfeNumero(
    (await lastAuthorizedNfeNumero(admin, tenantId)) + 1
  );

  await db
    .from("nfes")
    .update({
      status: "processing",
      external_started_at: new Date().toISOString(),
      error_message: null,
      nfe_number: nextNumero,
    })
    .eq("id", nfe.id)
    .eq("tenant_id", tenantId);

  let blingNfeId: number;
  try {
    blingNfeId = await upsertSequentialNfe(
      admin,
      tenantId,
      salesOrderId,
      prepared.pedido_venda_id,
      prepared.contact_id,
      prepared.natureza_operacao_id,
      nextNumero,
      nfe.bling_nfe_id ? Number(nfe.bling_nfe_id) : null
    );
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
        reconcile_needed: false,
        external_started_at: null,
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
    await alignBlingNfeCsosnIfConsumidorFinal(
      admin,
      tenantId,
      salesOrderId,
      blingNfeId
    );
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
