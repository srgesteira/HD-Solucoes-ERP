import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

type Admin = SupabaseClient<Database>;

const AMOUNT_TOLERANCE = 0.02;
const DATE_WINDOW_DAYS = 7;

const UNPAID_RECEIVABLE_STATUSES = ["pending", "partial", "overdue"] as const;
const UNPAID_PAYABLE_STATUSES = ["pending", "overdue"] as const;

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

function dateWithinWindow(lineDate: string, dueDate: string): boolean {
  const a = new Date(`${lineDate.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${dueDate.slice(0, 10)}T12:00:00`).getTime();
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);
  return diffDays <= DATE_WINDOW_DAYS;
}

function dateDiffDays(lineDate: string, dueDate: string): number {
  const a = new Date(`${lineDate.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${dueDate.slice(0, 10)}T12:00:00`).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function scoreCandidate(
  lineAmount: number,
  lineDate: string,
  targetAmount: number,
  dueDate: string
): number {
  const amountDiff = Math.abs(Math.abs(lineAmount) - targetAmount);
  const dateDiff = dateDiffDays(lineDate, dueDate);
  return amountDiff * 10 + dateDiff;
}

export type BankMatchCandidate = {
  id: string;
  kind: "receivable" | "payable";
  label: string;
  amount: number;
  due_date: string;
  score: number;
};

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
    .in("status", [...UNPAID_RECEIVABLE_STATUSES]);

  if (recvErr) throw new Error(recvErr.message);

  const { data: payables, error: payErr } = await admin
    .from("accounts_payable")
    .select("id, current_amount, due_date, description, status")
    .eq("tenant_id", tenantId)
    .in("status", [...UNPAID_PAYABLE_STATUSES]);

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

export async function listMatchCandidatesForLine(
  admin: Admin,
  tenantId: string,
  lineId: string
): Promise<{
  line: {
    id: string;
    amount: number;
    transaction_date: string;
    description: string | null;
  };
  candidates: BankMatchCandidate[];
}> {
  const db = asUntypedAdmin(admin);

  const { data: line, error: lineErr } = await db
    .from("bank_statement_lines")
    .select("id, amount, transaction_date, description")
    .eq("id", lineId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (lineErr) throw new Error(lineErr.message);
  if (!line) throw new Error("Linha do extrato não encontrada.");

  const amount = Number(line.amount);
  const txDate = String(line.transaction_date);
  const candidates: BankMatchCandidate[] = [];

  if (amount > 0) {
    const { data: receivables, error } = await admin
      .from("receivables")
      .select("id, current_amount, due_date, client_name, document_number")
      .eq("tenant_id", tenantId)
      .in("status", [...UNPAID_RECEIVABLE_STATUSES])
      .order("due_date", { ascending: true })
      .limit(100);

    if (error) throw new Error(error.message);

    for (const r of receivables ?? []) {
      const current = Number(r.current_amount);
      candidates.push({
        id: r.id,
        kind: "receivable",
        label:
          [r.client_name, r.document_number].filter(Boolean).join(" · ") ||
          r.id.slice(0, 8),
        amount: current,
        due_date: String(r.due_date),
        score: scoreCandidate(amount, txDate, current, String(r.due_date)),
      });
    }
  } else if (amount < 0) {
    const abs = Math.abs(amount);
    const { data: payables, error } = await admin
      .from("accounts_payable")
      .select("id, current_amount, due_date, description")
      .eq("tenant_id", tenantId)
      .in("status", [...UNPAID_PAYABLE_STATUSES])
      .order("due_date", { ascending: true })
      .limit(100);

    if (error) throw new Error(error.message);

    for (const p of payables ?? []) {
      const current = Number(p.current_amount);
      candidates.push({
        id: p.id,
        kind: "payable",
        label: p.description?.trim() || p.id.slice(0, 8),
        amount: current,
        due_date: String(p.due_date),
        score: scoreCandidate(abs, txDate, current, String(p.due_date)),
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  return {
    line: {
      id: line.id,
      amount,
      transaction_date: txDate,
      description: line.description ?? null,
    },
    candidates: candidates.slice(0, 25),
  };
}

export async function matchBankStatementLine(
  admin: Admin,
  tenantId: string,
  lineId: string,
  payload: {
    kind: "receivable" | "payable" | "ignore" | "unmatch";
    target_id?: string | null;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);

  if (payload.kind === "unmatch") {
    const { error } = await db
      .from("bank_statement_lines")
      .update({
        match_status: "unmatched",
        matched_receivable_id: null,
        matched_payable_id: null,
      })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return;
  }

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
