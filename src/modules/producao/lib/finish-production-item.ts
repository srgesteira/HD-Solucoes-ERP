import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { applyProductionFinishInbound } from "@/modules/almoxarifado/lib/production-finish-inventory";
import { ensureProductionSupplyForFinish } from "@/modules/almoxarifado/lib/production-supply";
import { assertCanFinishProduction } from "@/modules/producao/lib/line-apontamento";
import { resolveLineApontamentoStatus } from "@/modules/producao/lib/line-apontamento";
import { maybeMarkSalesOrderReadyForInvoice } from "@/modules/vendas/lib/sales/sales-order-ready-for-invoice";

type Admin = SupabaseClient<Database>;

export type FinishProductionItemInput = {
  orderItemId: string;
  userId: string;
  qualityControl?: string | null;
  notes?: string | null;
  /** Campos legados PCP (complete-item) — preenchidos se ausentes */
  legacyProductionDates?: boolean;
};

export type FinishProductionItemResult = {
  order_item: Database["public"]["Tables"]["order_items"]["Row"];
  supply: Awaited<ReturnType<typeof ensureProductionSupplyForFinish>>;
  inventory: Awaited<ReturnType<typeof applyProductionFinishInbound>>;
};

/**
 * Finalização unificada de item de produção: abastecimento BOM + entrada acabado + status.
 * Usado por finish-production e complete-item (legado).
 */
export async function finishProductionOrderItem(
  admin: Admin,
  tenantId: string,
  input: FinishProductionItemInput
): Promise<FinishProductionItemResult> {
  const { orderItemId, userId, qualityControl, notes, legacyProductionDates } =
    input;

  const { data: existing, error: fetchErr } = await admin
    .from("order_items")
    .select(
      "id, apontamento_start_at, apontamento_end_at, completed_at, status, is_suggestion, warehouse_supplied_at, production_start, production_end"
    )
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Item de produção não encontrado");
  if (existing.is_suggestion) {
    throw new Error("Não é possível apontar numa sugestão do MRP.");
  }

  const apontStatus = resolveLineApontamentoStatus(existing);
  if (apontStatus === "finished") {
    throw new Error("Este item já foi finalizado.");
  }
  if (apontStatus === "not_started" && !legacyProductionDates) {
    throw new Error("Inicie a produção antes de finalizar.");
  }

  const gate = await assertCanFinishProduction(admin, tenantId, orderItemId);
  if (!gate.allowed) {
    const err = new Error(gate.reason);
    (err as Error & { code?: string }).code = gate.code;
    throw err;
  }

  const supply = await ensureProductionSupplyForFinish(
    admin,
    tenantId,
    orderItemId,
    userId
  );
  const inventory = await applyProductionFinishInbound(
    admin,
    tenantId,
    orderItemId,
    userId
  );

  const now = new Date().toISOString();
  const patch: Database["public"]["Tables"]["order_items"]["Update"] = {
    apontamento_end_at: now,
    completed_at: now,
    status: "completed",
  };
  if (qualityControl !== undefined) patch.quality_control = qualityControl;
  if (notes !== undefined) patch.production_notes = notes;
  if (legacyProductionDates) {
    patch.production_start = existing.production_start ?? now;
    patch.production_end = now;
  }

  const { data, error } = await admin
    .from("order_items")
    .update(patch)
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Item de produção não encontrado");

  try {
    await maybeMarkSalesOrderReadyForInvoice(admin, tenantId, orderItemId);
  } catch (syncErr) {
    console.warn(
      "[finishProductionOrderItem] ready_for_invoice:",
      syncErr instanceof Error ? syncErr.message : syncErr
    );
  }

  return { order_item: data, supply, inventory };
}
