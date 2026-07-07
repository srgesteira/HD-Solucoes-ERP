/**
 * Reconcilia AP de um PC com payment_installments/total atuais.
 * Uso: node scripts/reconcile-po-payables.mjs PV-2026-0002-1-MO-A11-003
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const text = readFileSync(join(here, "..", ".env.local"), "utf-8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const poNumberArg = process.argv[2];
if (!poNumberArg) {
  console.error("Uso: node scripts/reconcile-po-payables.mjs <po_number>");
  process.exit(1);
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PO_SELECT =
  "id, tenant_id, po_number, order_date, supplier_id, status, subtotal, discount, tax, total_ipi, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments";

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function computeTotal(order) {
  const extras =
    num(order.freight_cost) +
    num(order.insurance_cost) +
    num(order.other_costs) +
    num(order.total_tax_non_creditable);
  return Math.max(
    0,
    num(order.subtotal) -
      num(order.discount) +
      num(order.tax) +
      num(order.total_ipi) +
      extras
  );
}

function addDaysToISODate(isoDate, days) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function splitAmountInInstallments(total, n) {
  if (n <= 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const baseCents = Math.floor(cents / n);
  const remainder = cents - baseCents * n;
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push((baseCents + (i < remainder ? 1 : 0)) / 100);
  }
  return parts;
}

function buildTargets(order) {
  const total = computeTotal(order);
  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const amounts = splitAmountInInstallments(total, n);
  let due = addDaysToISODate(
    String(order.order_date).slice(0, 10),
    order.payment_days_to_first_due ?? 30
  );
  const dueDates = [];
  const descriptions = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      due = addDaysToISODate(due, order.payment_days_between_installments ?? 0);
    }
    dueDates.push(due);
    descriptions.push(`Parcela ${i + 1}/${n} — PC ${order.po_number}`);
  }
  return { amounts, dueDates, descriptions, n, total };
}

function mutable(row) {
  const orig = Number(row.original_amount ?? 0);
  const cur = Number(row.current_amount ?? 0);
  return (
    !row.amount_locked && row.status === "pending" && Math.abs(cur - orig) < 0.001
  );
}

async function main() {
  const { data: po, error } = await admin
    .from("purchase_orders")
    .select(PO_SELECT)
    .ilike("po_number", `%${poNumberArg}%`)
    .maybeSingle();
  if (error || !po) {
    console.error("PC não encontrado:", error?.message ?? poNumberArg);
    process.exit(1);
  }

  const targets = buildTargets(po);
  const isForecast = po.status !== "received";

  const { data: existing } = await admin
    .from("accounts_payable")
    .select(
      "id, installment_index, original_amount, current_amount, status, amount_locked, is_forecast"
    )
    .eq("purchase_order_id", po.id)
    .eq("source_kind", "purchase_order")
    .order("installment_index");

  const byIndex = new Map();
  for (const row of existing ?? []) {
    const idx = row.installment_index ?? 0;
    if (idx > 0 && !byIndex.has(idx)) byIndex.set(idx, row);
  }

  let updated = 0;
  let created = 0;
  let deleted = 0;

  for (let i = 0; i < targets.n; i++) {
    const installment = i + 1;
    const row = byIndex.get(installment);
    const newAmt = targets.amounts[i];
    const newDue = targets.dueDates[i];
    const newDesc = targets.descriptions[i];

    if (!row) {
      await admin.from("accounts_payable").insert({
        tenant_id: po.tenant_id,
        purchase_order_id: po.id,
        source_kind: "purchase_order",
        installment_index: installment,
        is_forecast: isForecast,
        amount_locked: false,
        description: newDesc,
        category: "Fornecedor",
        supplier_id: po.supplier_id,
        original_amount: newAmt,
        current_amount: newAmt,
        due_date: newDue,
        status: "pending",
      });
      created++;
      continue;
    }
    if (!mutable(row)) continue;
    await admin
      .from("accounts_payable")
      .update({
        original_amount: newAmt,
        current_amount: newAmt,
        due_date: newDue,
        description: newDesc,
        is_forecast: isForecast,
        supplier_id: po.supplier_id,
      })
      .eq("id", row.id);
    updated++;
  }

  for (const row of existing ?? []) {
    const idx = row.installment_index ?? 0;
    if (idx <= targets.n) continue;
    if (!mutable(row)) continue;
    await admin.from("accounts_payable").delete().eq("id", row.id);
    deleted++;
  }

  const { count } = await admin
    .from("accounts_payable")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", po.id);

  console.log(
    JSON.stringify({
      po_number: po.po_number,
      payment_installments: po.payment_installments,
      reconcile: { updated, created, deleted },
      ap_count_after: count,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
