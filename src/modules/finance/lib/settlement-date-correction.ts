import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { formatShortDate, todayIsoSaoPaulo } from "@/shared/utils/date";

type Admin = SupabaseClient<Database>;

export type SettlementDateCorrectionInput = {
  tenantId: string;
  /** "payable" → accounts_payable; "receivable" → receivables */
  sourceKind: "payable" | "receivable";
  sourceId: string;
  /** Nova data real do pagamento/recebimento (yyyy-MM-dd). */
  newDate: string;
  /** Data anterior gravada no título (para a nota de auditoria). */
  previousDate: string | null;
  /** Notas atuais do título (a correção é acrescentada, nunca apagada). */
  previousNotes: string | null;
};

export type SettlementDateCorrectionResult =
  | { ok: true; movementsUpdated: number }
  | { ok: false; status: number; message: string };

/**
 * Corrige a data de um título JÁ liquidado (pago/recebido) e do(s) movimento(s)
 * de extrato que ele gerou.
 *
 * O extrato (`financial_movements`) é append-only para VALOR: aqui só a data muda,
 * nunca o valor, e fica registada uma nota de auditoria no título
 * ("Data de pagamento corrigida de X para Y em Z").
 *
 * Caso típico: baixa feita em lote num dia (ex.: conciliação) com a data de hoje,
 * quando o dinheiro saiu do banco semanas antes.
 *
 * Títulos com mais de um movimento (pagamentos parciais) não são corrigidos
 * automaticamente — devolve 409 para evitar mover parcelas com datas diferentes.
 */
export async function correctSettlementDate(
  admin: Admin,
  input: SettlementDateCorrectionInput
): Promise<SettlementDateCorrectionResult> {
  const newDate = input.newDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, status: 400, message: "Data de pagamento inválida." };
  }

  const db = asUntypedAdmin(admin);

  const { data: movements, error: movErr } = await db
    .from("financial_movements")
    .select("id, movement_date")
    .eq("tenant_id", input.tenantId)
    .eq("source_kind", input.sourceKind)
    .eq("source_id", input.sourceId);

  if (movErr) {
    return { ok: false, status: 500, message: "Erro ao ler movimentos: " + movErr.message };
  }

  const rows = (movements ?? []) as { id: string; movement_date: string }[];
  if (rows.length > 1) {
    return {
      ok: false,
      status: 409,
      message:
        "Este título tem mais de um movimento (pagamentos parciais); corrija a data de cada movimento separadamente.",
    };
  }

  const movementChanged = rows.length === 1 && rows[0].movement_date !== newDate;
  const titleChanged = (input.previousDate ?? null) !== newDate;
  if (!movementChanged && !titleChanged) {
    return { ok: true, movementsUpdated: 0 };
  }

  if (movementChanged) {
    const { error: updMovErr } = await db
      .from("financial_movements")
      .update({ movement_date: newDate })
      .eq("id", rows[0].id)
      .eq("tenant_id", input.tenantId);
    if (updMovErr) {
      return {
        ok: false,
        status: 500,
        message: "Erro ao corrigir data do movimento: " + updMovErr.message,
      };
    }
  }

  const table = input.sourceKind === "payable" ? "accounts_payable" : "receivables";
  const label = input.sourceKind === "payable" ? "pagamento" : "recebimento";
  const previousShown = movementChanged
    ? rows[0].movement_date
    : input.previousDate ?? null;
  const auditNote = `Data de ${label} corrigida de ${formatShortDate(
    previousShown
  )} para ${formatShortDate(newDate)} em ${formatShortDate(todayIsoSaoPaulo())}.`;
  const notes = input.previousNotes?.trim()
    ? `${input.previousNotes.trim()}\n${auditNote}`
    : auditNote;

  const { error: updTitleErr } = await db
    .from(table)
    .update({ payment_date: newDate, notes })
    .eq("id", input.sourceId)
    .eq("tenant_id", input.tenantId);

  if (updTitleErr) {
    return {
      ok: false,
      status: 500,
      message: "Erro ao corrigir data do título: " + updTitleErr.message,
    };
  }

  return { ok: true, movementsUpdated: movementChanged ? 1 : 0 };
}
