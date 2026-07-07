/**
 * Dry-run Fatia 2: data composta (entrega + prazo) vs due_date atual nos provisórios.
 *
 * Uso: node scripts/cash-flow-prazo-composto-dry-run.mjs
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

function addDaysToISODate(isoDate, days) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayKey(iso) {
  if (!iso) return null;
  const s = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function provisionalDate(order, installmentIndex, fallbackDue) {
  const delivery = dayKey(order?.expected_delivery);
  if (!delivery) {
    return { date: dayKey(fallbackDue), usedFallback: true };
  }
  const idx = Math.max(1, installmentIndex ?? 1);
  let due = addDaysToISODate(delivery, order.payment_days_to_first_due ?? 30);
  for (let i = 2; i <= idx; i++) {
    due = addDaysToISODate(due, order.payment_days_between_installments ?? 0);
  }
  return { date: due, usedFallback: false };
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== DRY-RUN Fatia 2: prazo composto (entrega + pagamento) ===\n");

  const { data: receivables, error: rErr } = await admin
    .from("receivables")
    .select(
      "id, document_number, client_name, due_date, current_amount, installment_index, is_forecast, sales_order_id"
    )
    .eq("is_forecast", true)
    .in("status", ["pending", "partial"]);

  if (rErr) {
    console.error(rErr.message);
    process.exit(1);
  }

  const { data: payables, error: pErr } = await admin
    .from("accounts_payable")
    .select(
      "id, description, due_date, current_amount, installment_index, is_forecast, purchase_order_id"
    )
    .eq("is_forecast", true)
    .in("status", ["pending", "partial"]);

  if (pErr) {
    console.error(pErr.message);
    process.exit(1);
  }

  const soIds = [
    ...new Set((receivables ?? []).map((r) => r.sales_order_id).filter(Boolean)),
  ];
  const poIds = [
    ...new Set((payables ?? []).map((p) => p.purchase_order_id).filter(Boolean)),
  ];

  const { data: salesOrders } = soIds.length
    ? await admin
        .from("sales_orders")
        .select(
          "id, order_number, expected_delivery, payment_days_to_first_due, payment_days_between_installments"
        )
        .in("id", soIds)
    : { data: [] };

  const { data: purchaseOrders } = poIds.length
    ? await admin
        .from("purchase_orders")
        .select(
          "id, po_number, expected_delivery, payment_days_to_first_due, payment_days_between_installments"
        )
        .in("id", poIds)
    : { data: [] };

  const soById = new Map((salesOrders ?? []).map((o) => [o.id, o]));
  const poById = new Map((purchaseOrders ?? []).map((o) => [o.id, o]));

  let fallbackCount = 0;

  console.log("--- RECEBÍVEIS PROVISÓRIOS (venda) ---");
  if ((receivables ?? []).length === 0) {
    console.log("(nenhum)");
  }
  for (const r of receivables ?? []) {
    const o = soById.get(r.sales_order_id);
    const { date: nova, usedFallback } = provisionalDate(
      o,
      r.installment_index,
      r.due_date
    );
    if (usedFallback) fallbackCount += 1;
    const antiga = dayKey(r.due_date) ?? r.due_date;
    console.log(
      [
        `PV=${o?.order_number ?? "?"}`,
        `cliente=${r.client_name ?? "?"}`,
        `parcela=${r.installment_index ?? 1}`,
        `entrega=${o?.expected_delivery ?? "(vazio)"}`,
        `prazo1=${o?.payment_days_to_first_due ?? 30}d`,
        `valor=${r.current_amount}`,
        `DATA_ANTIGA=${antiga}`,
        `DATA_NOVA=${nova ?? "?"}`,
        usedFallback ? "[FALLBACK due_date]" : "",
      ].join(" | ")
    );
  }

  console.log("\n--- PAGÁVEIS PROVISÓRIOS (compra) ---");
  if ((payables ?? []).length === 0) {
    console.log("(nenhum)");
  }
  for (const p of payables ?? []) {
    const o = poById.get(p.purchase_order_id);
    const { date: nova, usedFallback } = provisionalDate(
      o,
      p.installment_index,
      p.due_date
    );
    if (usedFallback) fallbackCount += 1;
    const antiga = dayKey(p.due_date) ?? p.due_date;
    console.log(
      [
        `PC=${o?.po_number ?? "?"}`,
        `desc=${p.description ?? "?"}`,
        `parcela=${p.installment_index ?? 1}`,
        `entrega=${o?.expected_delivery ?? "(vazio)"}`,
        `prazo1=${o?.payment_days_to_first_due ?? 30}d`,
        `valor=${p.current_amount}`,
        `DATA_ANTIGA=${antiga}`,
        `DATA_NOVA=${nova ?? "?"}`,
        usedFallback ? "[FALLBACK due_date]" : "",
      ].join(" | ")
    );
  }

  console.log(`\nTotal provisórios: ${(receivables ?? []).length + (payables ?? []).length}`);
  console.log(`Com fallback (sem expected_delivery): ${fallbackCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
