/**
 * Emissão de NF-e (modelo 55) via Bling.
 * A conferência prepara o pedido de venda no Bling; aqui só geramos a
 * NF-e a partir desse pedido (POST /nfe com pedidoVendaId) e enviamos à SEFAZ.
 * @see https://developer.bling.com.br/referencia
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { InvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { validateSalesOrderCanEmitNfe } from "@/modules/faturamento/lib/sales-order-invoice-gates";
import { BlingApiError } from "@/modules/fiscal/lib/bling/bling-errors";
import { blingGet, blingPost, blingPut } from "@/modules/fiscal/lib/bling/bling-client";
import {
  parseBlingNfeSnapshot,
  unwrapBlingData,
} from "@/modules/fiscal/lib/bling/bling-nfe-status";
import { applyBlingNfeSnapshot } from "@/modules/fiscal/lib/bling/bling-apply-status";
import { searchBlingNfeForErpOrder } from "@/modules/fiscal/lib/bling/bling-reconcile";
import { resolveBlingCatalogForSalesOrder } from "@/modules/fiscal/lib/bling/bling-catalog";
import { ensureBlingPedidoForSalesOrder } from "@/modules/fiscal/lib/bling/bling-pedido";
import {
  buildBlingNfeCreateBody,
  fiscalReviewToBlingNfeCreateInput,
  nfeDataOperacao,
} from "@/modules/fiscal/lib/bling/bling-nfe-payload";
import { getFiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";

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

async function loadBlingNfeForUpdate(
  admin: Admin,
  tenantId: string,
  blingNfeId: number
): Promise<{ numero: string | number | null; serie: string | number | null } | null> {
  try {
    const payload = await blingGet(admin, tenantId, `/nfe/${blingNfeId}`);
    const data = unwrapBlingData(payload);
    if (!data) return null;
    return {
      numero: blingNfeNumeroField(data.numero),
      serie: blingNfeNumeroField(data.serie),
    };
  } catch (e) {
    if (e instanceof BlingApiError && (e.status === 404 || e.status === 410)) {
      return null;
    }
    throw e;
  }
}

async function findReusableBlingNfeOnOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  skipBlingId: number | null
): Promise<{
  localId: string;
  blingId: number;
  identity: { numero: string | number | null; serie: string | number | null };
} | null> {
  const db = asUntypedAdmin(admin);
  const { data } = await db
    .from("nfes")
    .select("id, bling_nfe_id, nfe_number, created_at")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .eq("provider", "bling")
    .neq("status", "cancelled")
    .not("bling_nfe_id", "is", null)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Array<{
    id: string;
    bling_nfe_id: number | null;
    nfe_number: string | null;
  }>;
  for (const row of rows) {
    const id = Number(row.bling_nfe_id);
    if (!Number.isFinite(id) || id === skipBlingId) continue;
    const identity = await loadBlingNfeForUpdate(admin, tenantId, id);
    if (identity) {
      return {
        localId: row.id,
        blingId: id,
        identity: {
          numero: identity.numero ?? blingNfeNumeroField(row.nfe_number),
          serie: identity.serie,
        },
      };
    }
  }
  return null;
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

  const review = await getFiscalOrderReview(admin, tenantId, salesOrderId);
  if (!review) {
    throw new Error("Pedido não encontrado para emitir a NF-e.");
  }

  const nfeBody = buildBlingNfeCreateBody(
    fiscalReviewToBlingNfeCreateInput(
      review,
      prepared.contact_id,
      nfeDataOperacao(review.order_date)
    )
  );
  const nfePayload: Record<string, unknown> = {
    ...nfeBody,
    pedidoVendaId: prepared.pedido_venda_id,
    ...(prepared.natureza_operacao_id
      ? { naturezaOperacao: { id: prepared.natureza_operacao_id } }
      : {}),
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

  let existingBlingId =
    nfe.bling_nfe_id != null && Number.isFinite(Number(nfe.bling_nfe_id))
      ? Number(nfe.bling_nfe_id)
      : null;

  let blingNfeId: number;
  try {
    let putIdentity: {
      numero: string | number | null;
      serie: string | number | null;
    } | null = null;
    if (existingBlingId) {
      putIdentity = await loadBlingNfeForUpdate(
        admin,
        tenantId,
        existingBlingId
      );
      if (!putIdentity) {
        await db
          .from("nfes")
          .update({
            status: "cancelled",
            error_message:
              "Nota apagada no Bling. A emissão reutiliza a rejeitada anterior.",
          })
          .eq("id", nfe.id)
          .eq("tenant_id", tenantId);
        const reused = nfe.sales_order_id
          ? await findReusableBlingNfeOnOrder(
              admin,
              tenantId,
              nfe.sales_order_id,
              existingBlingId
            )
          : null;
        if (!reused) {
          throw new Error(
            "A nota rejeitada foi apagada no Bling. Não vou abrir número novo — confira a nota anterior no Bling e volte a emitir."
          );
        }
        existingBlingId = reused.blingId;
        putIdentity = reused.identity;
        await db
          .from("nfes")
          .update({
            bling_nfe_id: reused.blingId,
            nfe_number:
              reused.identity.numero != null
                ? String(reused.identity.numero)
                : nfe.nfe_number,
            status: "processing",
            error_message: null,
          })
          .eq("id", reused.localId)
          .eq("tenant_id", tenantId);
        nfe.id = reused.localId;
      }
    }

    if (existingBlingId) {
      const numero =
        putIdentity?.numero ?? blingNfeNumeroField(nfe.nfe_number);
      if (numero == null) {
        throw new Error(
          "O Bling exige o número da nota no reenvio. A rejeitada local está sem número — confira no Bling."
        );
      }
      await blingPut(admin, tenantId, `/nfe/${existingBlingId}`, {
        ...nfePayload,
        numero,
        ...(putIdentity?.serie != null ? { serie: putIdentity.serie } : {}),
      });
      blingNfeId = existingBlingId;
    } else {
      let created: unknown;
      try {
        created = await blingPost(admin, tenantId, "/nfe", nfePayload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const today = new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Sao_Paulo",
        });
        if (
          /data de opera/i.test(msg) &&
          String(nfePayload.dataOperacao ?? "") !== today
        ) {
          created = await blingPost(admin, tenantId, "/nfe", {
            ...nfePayload,
            dataOperacao: today,
          });
        } else {
          throw e;
        }
      }
      const data = unwrapBlingData(created);
      const id = Number(data?.id);
      if (!Number.isFinite(id)) {
        throw new Error("Bling criou a nota mas não devolveu o ID.");
      }
      blingNfeId = id;
    }
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
