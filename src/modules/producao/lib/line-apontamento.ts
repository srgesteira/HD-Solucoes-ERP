import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

export type LineApontamentoStatus = "not_started" | "in_progress" | "finished";

export type LineApontamentoFields = {
  apontamento_start_at?: string | null;
  apontamento_end_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
};

export const LINE_APONTAMENTO_STATUS_LABELS: Record<LineApontamentoStatus, string> =
  {
    not_started: "Não iniciado",
    in_progress: "Em produção",
    finished: "Finalizado",
  };

export function resolveLineApontamentoStatus(
  item: LineApontamentoFields
): LineApontamentoStatus {
  if (item.apontamento_end_at || item.completed_at || item.status === "completed") {
    return "finished";
  }
  if (item.apontamento_start_at || item.status === "in_progress") {
    return "in_progress";
  }
  return "not_started";
}

export function formatApontamentoDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type FinishProductionGateResult =
  | { allowed: true }
  | { allowed: false; reason: string; code?: string };

/**
 * Portão para finalizar produção (Etapa C: CQ poderá bloquear aqui).
 * Hoje sempre permite.
 */
export async function assertCanFinishProduction(
  _admin: SupabaseClient<Database>,
  _tenantId: string,
  _orderItemId: string
): Promise<FinishProductionGateResult> {
  return { allowed: true };
}
