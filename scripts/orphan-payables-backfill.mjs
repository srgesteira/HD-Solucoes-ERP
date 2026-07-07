/**
 * Backfill: gera accounts_payable real (is_forecast=false) para PCs received órfãos.
 *
 * Dry-run: node scripts/orphan-payables-backfill.mjs
 * Aplicar: node scripts/orphan-payables-backfill.mjs --apply
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

const apply = process.argv.includes("--apply");
const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PO_SELECT =
  "id, tenant_id, po_number, order_date, supplier_id, status, subtotal, discount, tax, total_ipi, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments, payment_days_to_first_due, payment_days_between_installments, total";

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
    const extra = i < remainder ? 1 : 0;
    parts.push((baseCents + extra) / 100);
  }
  return parts;
}

function buildPayableRows(tenantId, order) {
  const total = computeTotal(order);
  if (total <= 0) return [];
  const n = Math.max(1, Math.min(999, order.payment_installments ?? 1));
  const amounts = splitAmountInInstallments(total, n);
  const baseDate = String(order.order_date).slice(0, 10);
  let due = addDaysToISODate(
    baseDate,
    order.payment_days_to_first_due ?? 30
  );
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      due = addDaysToISODate(
        due,
        order.payment_days_between_installments ?? 0
      );
    }
    const amt = amounts[i] ?? 0;
    rows.push({
      tenant_id: tenantId,
      purchase_order_id: order.id,
      source_kind: "purchase_order",
      installment_index: i + 1,
      is_forecast: true,
      amount_locked: false,
      description: `Parcela ${i + 1}/${n} — PC ${order.po_number}`,
      category: "Fornecedor",
      supplier_id: order.supplier_id,
      original_amount: amt,
      current_amount: amt,
      due_date: due,
      status: "pending",
      notes: null,
    });
  }
  return rows;
}

async function findOrphans() {
  const { data: received, error } = await admin
    .from("purchase_orders")
    .select(PO_SELECT)
    .eq("status", "received")
    .eq("is_suggestion", false);
  if (error) throw new Error(error.message);

  const orphans = [];
  for (const po of received ?? []) {
    const { count } = await admin
      .from("accounts_payable")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", po.id);
    if ((count ?? 0) === 0) orphans.push(po);
  }
  return orphans;
}

async function backfillOne(po) {
  const rows = buildPayableRows(po.tenant_id, po);
  if (!rows.length) {
    return { po_number: po.po_number, skipped: "no_rows" };
  }

  const { error: insErr } = await admin.from("accounts_payable").insert(rows);
  if (insErr) throw new Error(`${po.po_number}: ${insErr.message}`);

  const { data, error: updErr } = await admin
    .from("accounts_payable")
    .update({ is_forecast: false })
    .eq("tenant_id", po.tenant_id)
    .eq("purchase_order_id", po.id)
    .eq("status", "pending")
    .select("id, description, original_amount, is_forecast");

  if (updErr) throw new Error(`${po.po_number}: ${updErr.message}`);

  return {
    po_number: po.po_number,
    created: rows.length,
    confirmed: (data ?? []).length,
    payables: data ?? [],
  };
}

async function main() {
  const orphans = await findOrphans();
  orphans.sort((a, b) =>
    String(a.po_number).localeCompare(String(b.po_number), "pt-BR", {
      numeric: true,
    })
  );

  console.log(
    apply
      ? "=== APLICANDO backfill PCs órfãos ==="
      : "=== DRY-RUN backfill PCs órfãos ==="
  );
  console.log(`Órfãos encontrados: ${orphans.length}\n`);

  if (orphans.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  for (const po of orphans) {
    const total = computeTotal(po);
    console.log(
      `  ${po.po_number}\tR$ ${total.toFixed(2)}\t${po.id}${apply ? "" : " (dry-run)"}`
    );
  }

  if (!apply) {
    console.log("\nPara aplicar: node scripts/orphan-payables-backfill.mjs --apply");
    return;
  }

  console.log("");
  for (const po of orphans) {
    const result = await backfillOne(po);
    console.log(JSON.stringify(result));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
