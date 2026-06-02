/**
 * Recálculo de contas a pagar geradas por pedido de compra.
 *
 * Uso (dry run — padrão, só lista):
 *   node scripts/recalculate-payables-from-po.mjs
 *
 * Aplicar alterações (só após aprovação explícita):
 *   APPLY=1 node scripts/recalculate-payables-from-po.mjs
 *
 * Requer .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 * Opcional: TENANT_ID (senão usa o primeiro tenant).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key);

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function computeTotal(order) {
  return Math.max(
    0,
    num(order.subtotal) -
      num(order.discount) +
      num(order.tax) +
      num(order.total_ipi) +
      num(order.freight_cost) +
      num(order.insurance_cost) +
      num(order.other_costs) +
      num(order.total_tax_non_creditable)
  );
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

async function resolveTenantId() {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const { data, error } = await admin.from("tenants").select("id").limit(1);
  if (error) throw error;
  if (!data?.[0]?.id) throw new Error("Nenhum tenant encontrado.");
  return data[0].id;
}

async function loadPayables(tenantId) {
  const withLock =
    "id, purchase_order_id, installment_index, description, status, amount_locked, original_amount, current_amount";
  const withoutLock =
    "id, purchase_order_id, installment_index, description, status, original_amount, current_amount";

  let res = await admin
    .from("accounts_payable")
    .select(withLock)
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null);

  if (res.error?.code === "42703") {
    res = await admin
      .from("accounts_payable")
      .select(withoutLock)
      .eq("tenant_id", tenantId)
      .not("purchase_order_id", "is", null);
    if (!res.error && res.data) {
      res.data = res.data.map((row) => ({ ...row, amount_locked: false }));
    }
  }

  return res;
}

async function dryRun(tenantId) {
  const { data: payables, error } = await loadPayables(tenantId);

  if (error) throw error;
  if (!payables?.length) {
    return { would_update: [], skipped: [] };
  }

  const poIds = [...new Set(payables.map((p) => p.purchase_order_id).filter(Boolean))];
  const { data: orders, error: poErr } = await admin
    .from("purchase_orders")
    .select(
      "id, po_number, subtotal, discount, tax, total_ipi, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, payment_installments"
    )
    .eq("tenant_id", tenantId)
    .in("id", poIds);

  if (poErr) throw poErr;

  const poById = new Map((orders ?? []).map((o) => [o.id, o]));
  const targetByPo = new Map();
  for (const po of orders ?? []) {
    const total = computeTotal(po);
    const n = Math.max(1, Math.min(999, po.payment_installments ?? 1));
    targetByPo.set(po.id, splitAmountInInstallments(total, n));
  }

  const would_update = [];
  const skipped = [];

  for (const row of payables) {
    const po = poById.get(row.purchase_order_id);
    const poNumber = po?.po_number ?? row.purchase_order_id;
    const orig = num(row.original_amount);
    const cur = num(row.current_amount);
    const hasPayment = Math.abs(cur - orig) > 0.001;
    const targets = targetByPo.get(row.purchase_order_id);
    const idx = (row.installment_index ?? 1) - 1;
    const newAmt = targets?.[idx];

    if (row.amount_locked) {
      skipped.push({ ...row, po_number: poNumber, reason: "amount_locked" });
      continue;
    }
    if (row.status !== "pending") {
      skipped.push({ ...row, po_number: poNumber, reason: `status_${row.status}` });
      continue;
    }
    if (hasPayment) {
      skipped.push({ ...row, po_number: poNumber, reason: "partial_payment" });
      continue;
    }
    if (newAmt === undefined) {
      skipped.push({
        ...row,
        po_number: poNumber,
        reason: "installment_index_out_of_range",
      });
      continue;
    }
    if (Math.abs(newAmt - orig) < 0.001) continue;

    would_update.push({
      payable_id: row.id,
      po_number: poNumber,
      installment_index: row.installment_index,
      old_original: orig,
      old_current: cur,
      new_amount: newAmt,
      po_total: po ? computeTotal(po) : null,
    });
  }

  return { would_update, skipped };
}

async function apply(tenantId, rows) {
  let updated = 0;
  for (const row of rows) {
    const { error } = await admin
      .from("accounts_payable")
      .update({
        original_amount: row.new_amount,
        current_amount: row.new_amount,
      })
      .eq("id", row.payable_id)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .eq("amount_locked", false);
    if (error) {
      console.error("Erro", row.payable_id, error.message);
    } else {
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  const tenantId = await resolveTenantId();
  const applyMode = process.env.APPLY === "1";

  console.log(`Tenant: ${tenantId}`);
  console.log(applyMode ? "MODO: APLICAR" : "MODO: DRY RUN (sem alterações)\n");

  const { would_update, skipped } = await dryRun(tenantId);

  console.log("=== SERIAM ATUALIZADAS ===");
  console.table(would_update);
  console.log(`Total: ${would_update.length}\n`);

  console.log("=== IGNORADAS (decisão manual) ===");
  console.table(
    skipped.map((s) => ({
      payable_id: s.id,
      po_number: s.po_number,
      parcela: s.installment_index,
      status: s.status,
      locked: s.amount_locked,
      original: s.original_amount,
      current: s.current_amount,
      reason: s.reason,
    }))
  );
  console.log(`Total ignoradas: ${skipped.length}\n`);

  if (applyMode) {
    if (would_update.length === 0) {
      console.log("Nada a aplicar.");
      return;
    }
    const updated = await apply(tenantId, would_update);
    console.log(`Aplicadas: ${updated}`);
  } else {
    console.log(
      "Para aplicar depois da aprovação: APPLY=1 node scripts/recalculate-payables-from-po.mjs"
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
