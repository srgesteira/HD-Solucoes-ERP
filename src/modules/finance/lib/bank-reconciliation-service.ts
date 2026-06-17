import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

type Admin = SupabaseClient<Database>;

const AMOUNT_TOLERANCE = 0.02;
const DATE_WINDOW_DAYS = 7;

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

function dateWithinWindow(lineDate: string, dueDate: string): boolean {
  const a = new Date(`${lineDate.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${dueDate.slice(0, 10)}T12:00:00`).getTime();
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);
  return diffDays <= DATE_WINDOW_DAYS;
}

export type BankMatchSuggestion = {
  line_id: string;
  kind: "receivable" | "payable";
  target_id: string;
  target_label: string;
  amount: number;
  date: string;
};

export async function autoMatchBankImport(
  admin: Admin,
  tenantId: string,
  importId: string
): Promise<{ matched: number; unmatched: number }> {
  const db = asUntypedAdmin(admin);

  const { data: lines, error: lineErr } = await db
    .from("bank_statement_lines")
    .select("id, transaction_date, amount, description, match_status")
    .eq("tenant_id", tenantId)
    .eq("bank_import_id", importId)
    .eq("match_status", "unmatched");

  if (lineErr) throw new Error(lineErr.message);
  if (!lines?.length) return { matched: 0, unmatched: 0 };

  const { data: receivables, error: recvErr } = await admin
    .from("receivables")
    .select("id, current_amount, due_date, client_name, document_number, status")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "partial", "overdue"]);

  if (recvErr) throw new Error(recvErr.message);

  const { data: payables, error: payErr } = await admin
    .from("accounts_payable")
    .select("id, current_amount, due_date, description, status")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "partial", "overdue"]);

  if (payErr) throw new Error(payErr.message);

  let matched = 0;

  for (const line of lines) {
    const amount = Number(line.amount);
    const txDate = String(line.transaction_date);

    if (amount > 0) {
      const hit = (receivables ?? []).find(
        (r) =>
          amountsMatch(Number(r.current_amount), amount) &&
          dateWithinWindow(txDate, String(r.due_date))
      );
      if (hit) {
        const { error } = await db
          .from("bank_statement_lines")
          .update({
            match_status: "matched",
            matched_receivable_id: hit.id,
            matched_payable_id: null,
          })
          .eq("id", line.id)
          .eq("tenant_id", tenantId);
        if (!error) matched++;
      }
    } else if (amount < 0) {
      const abs = Math.abs(amount);
      const hit = (payables ?? []).find(
        (p) =>
          amountsMatch(Number(p.current_amount), abs) &&
          dateWithinWindow(txDate, String(p.due_date))
      );
      if (hit) {
        const { error } = await db
          .from("bank_statement_lines")
          .update({
            match_status: "matched",
            matched_payable_id: hit.id,
            matched_receivable_id: null,
          })
          .eq("id", line.id)
          .eq("tenant_id", tenantId);
        if (!error) matched++;
      }
    }
  }

  return {
    matched,
    unmatched: lines.length - matched,
  };
}

export async function matchBankStatementLine(
  admin: Admin,
  tenantId: string,
  lineId: string,
  payload: {
    kind: "receivable" | "payable" | "ignore";
    target_id?: string | null;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);

  if (payload.kind === "ignore") {
    const { error } = await db
      .from("bank_statement_lines")
      .update({
        match_status: "ignored",
        matched_receivable_id: null,
        matched_payable_id: null,
      })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return;
  }

  const targetId = payload.target_id?.trim();
  if (!targetId) throw new Error("target_id é obrigatório para match manual.");

  if (payload.kind === "receivable") {
    const { data: recv } = await admin
      .from("receivables")
      .select("id")
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!recv) throw new Error("Recebível não encontrado.");

    const { error } = await db
      .from("bank_statement_lines")
      .update({
        match_status: "matched",
        matched_receivable_id: targetId,
        matched_payable_id: null,
      })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: pay } = await admin
    .from("accounts_payable")
    .select("id")
    .eq("id", targetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!pay) throw new Error("Conta a pagar não encontrada.");

  const { error } = await db
    .from("bank_statement_lines")
    .update({
      match_status: "matched",
      matched_payable_id: targetId,
      matched_receivable_id: null,
    })
    .eq("id", lineId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
