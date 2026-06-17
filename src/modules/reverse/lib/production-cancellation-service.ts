import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import type { ProductionCancellationReason } from "./returns-types";

/**
 * §10.2 — cancelamento de OP em andamento.
 *
 * Regras:
 *  - OP cancelada NÃO é deletada — recebe status="cancelled" e metadados
 *    (cancelled_at, cancelled_by, cancellation_reason, cancellation_notes).
 *  - O histórico de apontamento (etapas concluídas) permanece para
 *    relatórios de custo e produtividade.
 *  - Material já consumido não volta automaticamente ao estoque (decisão
 *    operacional: alguns insumos foram efetivamente usados; reverter
 *    em massa pode mascarar custo). A área tem de fazer ajuste manual
 *    via inventory_movements se quiser repor.
 *  - Compras já abertas para essa OP NÃO são canceladas automaticamente
 *    (Compras decide caso a caso para não bagunçar negociação).
 *  - Se OP veio de pedido de venda, o pedido NÃO é alterado — fluxo
 *    reverso de venda exige operação separada (sales_returns).
 *
 *  Tudo registado na audit_log com event_kind="production_order_cancelled".
 */

type Admin = SupabaseClient<Database>;

export type CancelProductionOrderArgs = {
  tenantId: string;
  userId: string;
  userEmail: string | null;
  productionOrderId: string;
  reason: ProductionCancellationReason;
  notes?: string | null;
};

export async function cancelProductionOrder(
  admin: Admin,
  args: CancelProductionOrderArgs
): Promise<void> {
  const db = asUntypedAdmin(admin);

  const { data: po, error: poErr } = await admin
    .from("production_orders")
    .select("id, status, order_number, tenant_id")
    .eq("id", args.productionOrderId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (poErr) throw new Error(poErr.message);
  if (!po) throw new Error("OP não encontrada.");

  if (po.status === "cancelled") {
    throw new Error("OP já está cancelada.");
  }
  // O enum de status (migration 20260509100000) só tem "finished", não
  // "completed". A devolução de venda existe para reverter OP concluída.
  if (po.status === "finished") {
    throw new Error(
      "OP concluída não pode ser cancelada — gere uma devolução de venda se necessário."
    );
  }

  // production_orders ganhou colunas de cancelamento que ainda não estão
  // nos types gerados (database.ts). Cast por segurança até regenerar.
  const dbAny = db as unknown as {
    from: (rel: string) => {
      update: (
        payload: Record<string, unknown>
      ) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };
  const updatePayload: Record<string, unknown> = {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancelled_by: args.userId,
    cancellation_reason: args.reason,
    cancellation_notes: args.notes ?? null,
  };
  const { error: updErr } = await dbAny
    .from("production_orders")
    .update(updatePayload)
    .eq("id", args.productionOrderId)
    .eq("tenant_id", args.tenantId);
  if (updErr) throw new Error(updErr.message);

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "production_orders",
    recordId: args.productionOrderId,
    eventKind: "production_order_cancelled",
    payload: {
      previous_status: po.status,
      reason: args.reason,
      notes: args.notes,
      order_number: po.order_number,
    },
  });
}
