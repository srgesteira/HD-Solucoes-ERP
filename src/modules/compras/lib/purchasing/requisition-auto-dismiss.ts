import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { dismissPurchaseRequisitions } from "@/modules/compras/lib/purchasing/requisition-dismiss";

type Admin = SupabaseClient<Database>;

/**
 * Requisições órfãs: quando uma OP é finalizada/cancelada ou um PV é cancelado,
 * as requisições de compra em rascunho (draft, sem PC, não-sugestão) ligadas a
 * eles deixam de fazer sentido e são dispensadas (status "dismissed").
 *
 * Relações (schema):
 *  - purchase_order_items.production_order_item_id → order_items.id
 *    (order_items.order_id → production_orders.id)
 *  - purchase_order_items.production_item_id (legado, mesmo alvo)
 *  - purchase_order_items.production_order_id → production_orders.id
 *  - purchase_order_items.sales_order_item_id → sales_order_items.id
 *    (sales_order_items.sales_order_id → sales_orders.id;
 *     sales_order_items.production_order_id → OP gerada para a linha)
 *
 * PCs já emitidos (purchase_order_id preenchido) NÃO são tocados.
 */

const CHUNK = 200;

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function openRequisitionsQuery(admin: Admin, tenantId: string) {
  return admin
    .from("purchase_order_items")
    .select("id, sales_order_item_id")
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .eq("status", "draft")
    .is("purchase_order_id", null);
}

async function collectIds(
  admin: Admin,
  tenantId: string,
  column:
    | "production_order_item_id"
    | "production_item_id"
    | "production_order_id"
    | "sales_order_item_id",
  values: string[],
  into: Map<string, string | null>
): Promise<void> {
  const uniq = [...new Set(values.filter(Boolean))];
  for (const part of chunks(uniq)) {
    const { data, error } = await openRequisitionsQuery(admin, tenantId).in(
      column,
      part
    );
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if (r.id) into.set(r.id, r.sales_order_item_id ?? null);
    }
  }
}

/**
 * Linhas de PV (entre as indicadas) cujo pedido NÃO está cancelado.
 * Usado no cancelamento de OP: se o PV segue ativo, a necessidade continua e
 * o MRP reaproveita o rascunho na nova OP. Dispensar aqui seria pior — o
 * "dismissed" por linha de venda bloquearia a requisição no replanejamento.
 */
async function activeSalesLineIds(
  admin: Admin,
  tenantId: string,
  salesOrderItemIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  const uniq = [...new Set(salesOrderItemIds.filter(Boolean))];
  for (const part of chunks(uniq)) {
    const { data, error } = await admin
      .from("sales_order_items")
      .select(
        "id, sales_order:sales_orders!sales_order_items_sales_order_id_fkey(status)"
      )
      .eq("tenant_id", tenantId)
      .in("id", part);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const so = Array.isArray(row.sales_order)
        ? row.sales_order[0]
        : row.sales_order;
      if (so && so.status !== "cancelled") out.add(row.id);
    }
  }
  return out;
}

/**
 * IDs das requisições draft abertas ligadas a uma OP (itens, OP e linhas de PV da OP).
 * `keepActiveSalesLines`: não devolve as que estão rastreadas a linha de PV ainda ativo.
 */
export async function findOpenRequisitionIdsForProductionOrder(
  admin: Admin,
  tenantId: string,
  productionOrderId: string,
  options?: { keepActiveSalesLines?: boolean }
): Promise<string[]> {
  const ids = new Map<string, string | null>();

  const { data: items, error: itErr } = await admin
    .from("order_items")
    .select("id, sales_order_item_id")
    .eq("tenant_id", tenantId)
    .eq("order_id", productionOrderId);
  if (itErr) throw new Error(itErr.message);

  const orderItemIds = (items ?? []).map((i) => i.id).filter(Boolean);
  await collectIds(admin, tenantId, "production_order_item_id", orderItemIds, ids);
  await collectIds(admin, tenantId, "production_item_id", orderItemIds, ids);
  await collectIds(admin, tenantId, "production_order_id", [productionOrderId], ids);

  // Linhas de PV atendidas por esta OP (materiais rastreados só pela linha de venda).
  const salesItemIds = new Set<string>();
  for (const i of items ?? []) {
    if (i.sales_order_item_id) salesItemIds.add(i.sales_order_item_id);
  }
  const { data: soLines, error: soErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("production_order_id", productionOrderId);
  if (soErr) throw new Error(soErr.message);
  for (const l of soLines ?? []) if (l.id) salesItemIds.add(l.id);
  await collectIds(admin, tenantId, "sales_order_item_id", [...salesItemIds], ids);

  if (options?.keepActiveSalesLines) {
    const traced = [...ids.values()].filter((v): v is string => Boolean(v));
    if (traced.length) {
      const active = await activeSalesLineIds(admin, tenantId, traced);
      for (const [id, soi] of [...ids.entries()]) {
        if (soi && active.has(soi)) ids.delete(id);
      }
    }
  }

  return [...ids.keys()];
}

/** IDs das requisições draft abertas ligadas às linhas de um PV (e às OPs dessas linhas). */
export async function findOpenRequisitionIdsForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<string[]> {
  const ids = new Map<string, string | null>();

  const { data: lines, error: lnErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);
  if (lnErr) throw new Error(lnErr.message);
  const lineIds = (lines ?? []).map((l) => l.id).filter(Boolean);
  if (!lineIds.length) return [];

  await collectIds(admin, tenantId, "sales_order_item_id", lineIds, ids);

  // Itens de OP gerados para essas linhas (requisições rastreadas só pelo item da OP).
  const orderItemIds: string[] = [];
  for (const part of chunks(lineIds)) {
    const { data: ois, error: oiErr } = await admin
      .from("order_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("sales_order_item_id", part);
    if (oiErr) throw new Error(oiErr.message);
    for (const oi of ois ?? []) if (oi.id) orderItemIds.push(oi.id);
  }
  await collectIds(admin, tenantId, "production_order_item_id", orderItemIds, ids);
  await collectIds(admin, tenantId, "production_item_id", orderItemIds, ids);

  return [...ids.keys()];
}

/** Dispensa IDs já coletados sem nunca lançar (falha → console.warn). */
export async function dismissRequisitionIdsSafe(
  admin: Admin,
  tenantId: string,
  requisitionIds: string[],
  context: string
): Promise<number> {
  try {
    if (!requisitionIds.length) return 0;
    const { dismissed } = await dismissPurchaseRequisitions(
      admin,
      tenantId,
      requisitionIds
    );
    return dismissed;
  } catch (e) {
    console.warn(
      `[requisitions] Falha ao dispensar requisições (${context}):`,
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

/** OP finalizada/cancelada/removida → dispensa requisições abertas. Nunca lança. */
export async function dismissRequisitionsForProductionOrder(
  admin: Admin,
  tenantId: string,
  productionOrderId: string,
  reason: "finished" | "cancelled" | "deleted"
): Promise<number> {
  const context = `OP ${productionOrderId} ${reason}`;
  try {
    const ids = await findOpenRequisitionIdsForProductionOrder(
      admin,
      tenantId,
      productionOrderId,
      // Finalizada: necessidade atendida. Cancelada/removida com PV ativo: a
      // linha será replanejada e o rascunho reaproveitado — não dispensar.
      { keepActiveSalesLines: reason !== "finished" }
    );
    return await dismissRequisitionIdsSafe(admin, tenantId, ids, context);
  } catch (e) {
    console.warn(
      `[requisitions] Falha ao localizar requisições (${context}):`,
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

/** PV cancelado → dispensa requisições abertas. Nunca lança. */
export async function dismissRequisitionsForSalesOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<number> {
  const context = `PV ${salesOrderId} cancelado`;
  try {
    const ids = await findOpenRequisitionIdsForSalesOrder(
      admin,
      tenantId,
      salesOrderId
    );
    return await dismissRequisitionIdsSafe(admin, tenantId, ids, context);
  } catch (e) {
    console.warn(
      `[requisitions] Falha ao localizar requisições (${context}):`,
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}
