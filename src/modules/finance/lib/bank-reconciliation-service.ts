import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

type Admin = SupabaseClient<Database>;

const AMOUNT_TOLERANCE = 0.02;
const DATE_WINDOW_DAYS = 7;

const UNPAID_RECEIVABLE_STATUSES = ["pending", "partial", "overdue"] as const;
const UNPAID_PAYABLE_STATUSES = ["pending", "overdue"] as const;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function receivableStatusAfterBalance(
  dueDate: string,
  paidAmount: number,
  currentAmount: number
): string {
  if (currentAmount <= 0.005) return "paid";
  if (paidAmount > 0.005) return "partial";
  return dueDate.slice(0, 10) < todayIsoDate() ? "overdue" : "pending";
}

function payableStatusAfterBalance(
  dueDate: string,
  currentAmount: number
): string {
  if (currentAmount <= 0.005) return "paid";
  return dueDate.slice(0, 10) < todayIsoDate() ? "overdue" : "pending";
}

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

async function loadBankLine(
  admin: Admin,
  tenantId: string,
  lineId: string
): Promise<{
  id: string;
  amount: number;
  transaction_date: string;
  description: string | null;
  match_status: string;
  applied_amount: number | null;
  matched_receivable_id: string | null;
  matched_payable_id: string | null;
}> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("bank_statement_lines")
    .select(
      "id, amount, transaction_date, description, match_status, applied_amount, matched_receivable_id, matched_payable_id"
    )
    .eq("id", lineId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Linha do extrato não encontrada.");
  return data as {
    id: string;
    amount: number;
    transaction_date: string;
    description: string | null;
    match_status: string;
    applied_amount: number | null;
    matched_receivable_id: string | null;
    matched_payable_id: string | null;
  };
}

async function applyReceivableSettlement(
  admin: Admin,
  tenantId: string,
  receivableId: string,
  paymentAmount: number,
  paymentDate: string
): Promise<number> {
  const { data: current, error } = await admin
    .from("receivables")
    .select("id, current_amount, paid_amount, status, due_date")
    .eq("id", receivableId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!current) throw new Error("Recebível não encontrado.");
  if (current.status === "paid" || current.status === "cancelled") {
    throw new Error("Recebível encerrado.");
  }

  const recv = roundMoney(
    Math.min(Math.abs(paymentAmount), Number(current.current_amount))
  );
  if (recv <= 0) throw new Error("Recebível sem saldo para baixa.");

  const newPaid = roundMoney(Number(current.paid_amount) + recv);
  const newCurrent = roundMoney(Number(current.current_amount) - recv);
  const payDate = paymentDate.slice(0, 10);

  const { error: updErr } = await admin
    .from("receivables")
    .update({
      paid_amount: newPaid,
      current_amount: newCurrent <= 0.005 ? 0 : newCurrent,
      payment_date: payDate,
      status: receivableStatusAfterBalance(
        String(current.due_date),
        newPaid,
        newCurrent
      ),
    })
    .eq("id", receivableId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);
  return recv;
}

async function reverseReceivableSettlement(
  admin: Admin,
  tenantId: string,
  receivableId: string,
  appliedAmount: number
): Promise<void> {
  const applied = roundMoney(appliedAmount);
  if (applied <= 0) return;

  const { data: current, error } = await admin
    .from("receivables")
    .select("id, current_amount, paid_amount, status, due_date, payment_date")
    .eq("id", receivableId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!current) throw new Error("Recebível não encontrado.");

  const newPaid = roundMoney(Math.max(0, Number(current.paid_amount) - applied));
  const newCurrent = roundMoney(Number(current.current_amount) + applied);

  const { error: updErr } = await admin
    .from("receivables")
    .update({
      paid_amount: newPaid,
      current_amount: newCurrent,
      payment_date: newPaid > 0.005 ? current.payment_date : null,
      status: receivableStatusAfterBalance(
        String(current.due_date),
        newPaid,
        newCurrent
      ),
    })
    .eq("id", receivableId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);
}

async function applyPayableSettlement(
  admin: Admin,
  tenantId: string,
  payableId: string,
  paymentAmount: number,
  paymentDate: string
): Promise<number> {
  const { data: row, error } = await admin
    .from("accounts_payable")
    .select("id, current_amount, status, due_date")
    .eq("id", payableId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Conta a pagar não encontrada.");
  if (row.status === "paid" || row.status === "cancelled") {
    throw new Error("Conta a pagar encerrada.");
  }

  const pay = roundMoney(
    Math.min(Math.abs(paymentAmount), Number(row.current_amount))
  );
  if (pay <= 0) throw new Error("Conta a pagar sem saldo para baixa.");

  const newCurrent = roundMoney(Number(row.current_amount) - pay);
  const payDate = paymentDate.slice(0, 10);

  const { error: updErr } = await admin
    .from("accounts_payable")
    .update({
      current_amount: newCurrent <= 0.005 ? 0 : newCurrent,
      payment_date: newCurrent <= 0.005 ? payDate : null,
      status: payableStatusAfterBalance(String(row.due_date), newCurrent),
    })
    .eq("id", payableId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);
  return pay;
}

async function reversePayableSettlement(
  admin: Admin,
  tenantId: string,
  payableId: string,
  appliedAmount: number
): Promise<void> {
  const applied = roundMoney(appliedAmount);
  if (applied <= 0) return;

  const { data: row, error } = await admin
    .from("accounts_payable")
    .select("id, current_amount, status, due_date, payment_date")
    .eq("id", payableId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Conta a pagar não encontrada.");

  const newCurrent = roundMoney(Number(row.current_amount) + applied);

  const { error: updErr } = await admin
    .from("accounts_payable")
    .update({
      current_amount: newCurrent,
      payment_date: null,
      status: payableStatusAfterBalance(String(row.due_date), newCurrent),
    })
    .eq("id", payableId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);
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

    try {
      if (amount > 0) {
        const hit = (receivables ?? []).find(
          (r) =>
            amountsMatch(Number(r.current_amount), amount) &&
            dateWithinWindow(txDate, String(r.due_date))
        );
        if (!hit) continue;

        await matchBankStatementLine(admin, tenantId, line.id, {
          kind: "receivable",
          target_id: hit.id,
        });
        hit.current_amount = roundMoney(Number(hit.current_amount) - amount);
        matched++;
      } else if (amount < 0) {
        const abs = Math.abs(amount);
        const hit = (payables ?? []).find(
          (p) =>
            amountsMatch(Number(p.current_amount), abs) &&
            dateWithinWindow(txDate, String(p.due_date))
        );
        if (!hit) continue;

        await matchBankStatementLine(admin, tenantId, line.id, {
          kind: "payable",
          target_id: hit.id,
        });
        hit.current_amount = roundMoney(Number(hit.current_amount) - abs);
        matched++;
      }
    } catch {
      // linha permanece unmatched se baixa falhar
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
  const line = await loadBankLine(admin, tenantId, lineId);

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
): Promise<{ applied_amount?: number }> {
  const db = asUntypedAdmin(admin);
  const line = await loadBankLine(admin, tenantId, lineId);

  if (payload.kind === "unmatch") {
    if (line.match_status === "matched") {
      const applied = Number(line.applied_amount ?? 0);
      if (line.matched_receivable_id && applied > 0) {
        await reverseReceivableSettlement(
          admin,
          tenantId,
          line.matched_receivable_id,
          applied
        );
      }
      if (line.matched_payable_id && applied > 0) {
        await reversePayableSettlement(
          admin,
          tenantId,
          line.matched_payable_id,
          applied
        );
      }
    }

    const { error } = await db
      .from("bank_statement_lines")
      .update({
        match_status: "unmatched",
        matched_receivable_id: null,
        matched_payable_id: null,
        applied_amount: null,
      })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return {};
  }

  if (payload.kind === "ignore") {
    if (line.match_status !== "unmatched") {
      throw new Error("Só é possível ignorar linhas pendentes.");
    }
    const { error } = await db
      .from("bank_statement_lines")
      .update({
        match_status: "ignored",
        matched_receivable_id: null,
        matched_payable_id: null,
        applied_amount: null,
      })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return {};
  }

  if (line.match_status !== "unmatched") {
    throw new Error("Linha já conciliada ou ignorada.");
  }

  const targetId = payload.target_id?.trim();
  if (!targetId) throw new Error("target_id é obrigatório para match manual.");

  const paymentDate = String(line.transaction_date).slice(0, 10);
  const lineAmount = Number(line.amount);

  if (payload.kind === "receivable") {
    if (lineAmount <= 0) {
      throw new Error("Linha de crédito só concilia com recebível.");
    }

    const applied = await applyReceivableSettlement(
      admin,
      tenantId,
      targetId,
      lineAmount,
      paymentDate
    );

    const { error } = await db
      .from("bank_statement_lines")
      .update({
        match_status: "matched",
        matched_receivable_id: targetId,
        matched_payable_id: null,
        applied_amount: applied,
      })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { applied_amount: applied };
  }

  if (lineAmount >= 0) {
    throw new Error("Linha de débito só concilia com conta a pagar.");
  }

  const applied = await applyPayableSettlement(
    admin,
    tenantId,
    targetId,
    lineAmount,
    paymentDate
  );

  const { error } = await db
    .from("bank_statement_lines")
    .update({
      match_status: "matched",
      matched_payable_id: targetId,
      matched_receivable_id: null,
      applied_amount: applied,
    })
    .eq("id", lineId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return { applied_amount: applied };
}
