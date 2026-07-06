import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export type FinancialMovementSourceKind = "payable" | "receivable" | "manual";

export type RecordFinancialMovementInput = {
  tenantId: string;
  direction: "in" | "out";
  amount: number;
  movementDate: string;
  sourceKind: FinancialMovementSourceKind;
  sourceId: string;
  description: string;
  referenceId?: string | null;
  createdBy?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildPayableMovementDescription(description: string): string {
  const trimmed = description.trim();
  return trimmed ? `Pagamento: ${trimmed}` : "Pagamento de conta a pagar";
}

export function buildReceivableMovementDescription(
  description: string | null,
  clientName: string | null
): string {
  const base =
    description?.trim() ||
    (clientName?.trim() ? `Recebimento — ${clientName.trim()}` : "");
  return base ? `Recebimento: ${base}` : "Recebimento de conta a receber";
}

export async function recordFinancialMovement(
  admin: Admin,
  input: RecordFinancialMovementInput
): Promise<{ id: string }> {
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valor do movimento inválido.");
  }

  const movementDate = input.movementDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
    throw new Error("Data do movimento inválida.");
  }

  const { data, error } = await admin
    .from("financial_movements")
    .insert({
      tenant_id: input.tenantId,
      direction: input.direction,
      amount,
      movement_date: movementDate,
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      description: input.description.trim() || "Movimento financeiro",
      reference_id: input.referenceId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { id: data.id };
}
