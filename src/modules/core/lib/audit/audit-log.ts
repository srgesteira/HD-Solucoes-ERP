import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

/**
 * §14 do documento funcional: trilha de auditoria.
 *
 * Triggers de banco (audit_log_record_change) cobrem INSERT/UPDATE/DELETE
 * automaticamente. Esta camada é só para EVENTOS DE DOMÍNIO explícitos
 * — ações que não viram apenas mudança de coluna mas têm valor de
 * auditoria (orçamento aprovado, regra fiscal substituída, devolução
 * autorizada, etc).
 */

export type AuditEventArgs = {
  tenantId: string;
  actorId: string | null;
  actorEmail?: string | null;
  table: string;
  recordId: string;
  eventKind: string;
  payload?: Record<string, unknown>;
};

export type AuditLogRow = {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: "insert" | "update" | "delete" | "event";
  table_name: string;
  record_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_fields: string[] | null;
  event_kind: string | null;
  event_payload: Record<string, unknown> | null;
  occurred_at: string;
};

/**
 * Registra um evento de domínio. Não usa o trigger automático;
 * sempre `action = 'event'` com `event_kind` explícito.
 */
export async function recordAuditEvent(
  admin: SupabaseClient<Database>,
  args: AuditEventArgs
): Promise<void> {
  const db = asUntypedAdmin(admin);
  await db.from("audit_log").insert({
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    actor_email: args.actorEmail ?? null,
    action: "event",
    table_name: args.table,
    record_id: args.recordId,
    event_kind: args.eventKind,
    event_payload: (args.payload ?? {}) as Json,
  });
}

/**
 * Lista o histórico de um registo (cronológico decrescente).
 * Retorna até `limit` linhas (default 100).
 */
export async function listAuditEntries(
  admin: SupabaseClient<Database>,
  args: { tenantId: string; table: string; recordId: string; limit?: number }
): Promise<AuditLogRow[]> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("audit_log")
    .select("*")
    .eq("tenant_id", args.tenantId)
    .eq("table_name", args.table)
    .eq("record_id", args.recordId)
    .order("occurred_at", { ascending: false })
    .limit(args.limit ?? 100);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}
