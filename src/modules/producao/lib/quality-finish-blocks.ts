import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export type QualityFinishBlockRow = {
  id: string;
  tenant_id: string;
  order_item_id: string;
  block_reason: string;
  blocked_by: string | null;
  blocked_at: string;
  release_action: string | null;
  released_by: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QualityFinishBlockActive = {
  id: string;
  block_reason: string;
  blocked_at: string;
  blocked_by: string | null;
};

export type QualityFinishBlockHistoryEntry = {
  id: string;
  block_reason: string;
  blocked_at: string;
  blocked_by: string | null;
  release_action: string | null;
  released_at: string | null;
  released_by: string | null;
};

export type QualityFinishBlockSummary = {
  active: QualityFinishBlockActive | null;
  /** Ciclos já liberados (histórico). */
  released_count: number;
  history: QualityFinishBlockHistoryEntry[];
};

export type PlanningQualityFinishFields = {
  cq_finish_block_active: boolean;
  cq_finish_block_id: string | null;
  cq_finish_block_reason: string | null;
  cq_finish_block_at: string | null;
  /** Quantidade de bloqueios já liberados no passado. */
  cq_finish_blocks_released_count: number;
};

export const EMPTY_PLANNING_QUALITY_FINISH: PlanningQualityFinishFields = {
  cq_finish_block_active: false,
  cq_finish_block_id: null,
  cq_finish_block_reason: null,
  cq_finish_block_at: null,
  cq_finish_blocks_released_count: 0,
};

export function planningFieldsFromSummary(
  summary: QualityFinishBlockSummary | undefined
): PlanningQualityFinishFields {
  if (!summary) return { ...EMPTY_PLANNING_QUALITY_FINISH };
  return {
    cq_finish_block_active: summary.active != null,
    cq_finish_block_id: summary.active?.id ?? null,
    cq_finish_block_reason: summary.active?.block_reason ?? null,
    cq_finish_block_at: summary.active?.blocked_at ?? null,
    cq_finish_blocks_released_count: summary.released_count,
  };
}

export async function getActiveQualityFinishBlock(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<QualityFinishBlockActive | null> {
  const { data, error } = await admin
    .from("production_quality_finish_blocks")
    .select("id, block_reason, blocked_at, blocked_by")
    .eq("tenant_id", tenantId)
    .eq("order_item_id", orderItemId)
    .is("released_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    block_reason: data.block_reason,
    blocked_at: data.blocked_at,
    blocked_by: data.blocked_by,
  };
}

export async function loadQualityFinishBlockSummaries(
  admin: Admin,
  tenantId: string,
  orderItemIds: string[]
): Promise<Map<string, QualityFinishBlockSummary>> {
  const out = new Map<string, QualityFinishBlockSummary>();
  if (orderItemIds.length === 0) return out;

  const unique = [...new Set(orderItemIds)];
  const { data, error } = await admin
    .from("production_quality_finish_blocks")
    .select(
      "id, order_item_id, block_reason, blocked_at, blocked_by, release_action, released_at, released_by"
    )
    .eq("tenant_id", tenantId)
    .in("order_item_id", unique)
    .order("blocked_at", { ascending: false });

  if (error) throw new Error(error.message);

  const byItem = new Map<string, QualityFinishBlockRow[]>();
  for (const row of data ?? []) {
    const list = byItem.get(row.order_item_id) ?? [];
    list.push(row as QualityFinishBlockRow);
    byItem.set(row.order_item_id, list);
  }

  for (const itemId of unique) {
    const rows = byItem.get(itemId) ?? [];
    const activeRow = rows.find((r) => r.released_at == null) ?? null;
    const released = rows.filter((r) => r.released_at != null);
    const history: QualityFinishBlockHistoryEntry[] = rows.map((r) => ({
      id: r.id,
      block_reason: r.block_reason,
      blocked_at: r.blocked_at,
      blocked_by: r.blocked_by,
      release_action: r.release_action,
      released_at: r.released_at,
      released_by: r.released_by,
    }));

    out.set(itemId, {
      active: activeRow
        ? {
            id: activeRow.id,
            block_reason: activeRow.block_reason,
            blocked_at: activeRow.blocked_at,
            blocked_by: activeRow.blocked_by,
          }
        : null,
      released_count: released.length,
      history,
    });
  }

  return out;
}

export async function blockQualityFinish(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  blockReason: string,
  blockedBy: string
): Promise<QualityFinishBlockRow> {
  const reason = blockReason.trim();
  if (!reason) throw new Error("O motivo do bloqueio é obrigatório.");

  const active = await getActiveQualityFinishBlock(admin, tenantId, orderItemId);
  if (active) {
    throw new Error("Este item já está bloqueado pelo Controle de Qualidade.");
  }

  const { data: item } = await admin
    .from("order_items")
    .select("id, is_suggestion, apontamento_end_at, completed_at")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!item) throw new Error("Item de produção não encontrado.");
  if (item.is_suggestion) {
    throw new Error("Não é possível bloquear uma sugestão do MRP.");
  }
  if (item.apontamento_end_at || item.completed_at) {
    throw new Error("Não é possível bloquear um item já finalizado.");
  }

  const { data, error } = await admin
    .from("production_quality_finish_blocks")
    .insert({
      tenant_id: tenantId,
      order_item_id: orderItemId,
      block_reason: reason,
      blocked_by: blockedBy,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este item já está bloqueado pelo Controle de Qualidade.");
    }
    throw new Error(error.message);
  }

  return data as QualityFinishBlockRow;
}

export async function releaseQualityFinish(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  releaseAction: string,
  releasedBy: string
): Promise<QualityFinishBlockRow> {
  const action = releaseAction.trim();
  if (!action) throw new Error("A ação tomada na liberação é obrigatória.");

  const active = await getActiveQualityFinishBlock(admin, tenantId, orderItemId);
  if (!active) {
    throw new Error("Este item não possui bloqueio ativo do Controle de Qualidade.");
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("production_quality_finish_blocks")
    .update({
      release_action: action,
      released_by: releasedBy,
      released_at: now,
      updated_at: now,
    })
    .eq("id", active.id)
    .eq("tenant_id", tenantId)
    .is("released_at", null)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Bloqueio não encontrado ou já foi liberado.");
  }

  return data as QualityFinishBlockRow;
}
