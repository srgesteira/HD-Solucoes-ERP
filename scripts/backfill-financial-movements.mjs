/**
 * Backfill financial_movements a partir de baixas históricas (AP pagas + CR pagos/parciais).
 *
 * Uso:
 *   node scripts/backfill-financial-movements.mjs           # dry-run (default)
 *   node scripts/backfill-financial-movements.mjs --apply   # INSERT (após OK manual)
 *
 * Limitação: parciais antigas de AP não têm histórico por parcela — 1 linha por título pago.
 * Recebíveis parciais: 1 linha com paid_amount acumulado na última payment_date.
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

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");

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

async function loadExistingSourceIds(sourceKind) {
  const ids = new Set();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await admin
      .from("financial_movements")
      .select("source_id")
      .eq("source_kind", sourceKind)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) ids.add(row.source_id);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

function payableDescription(description) {
  const trimmed = String(description ?? "").trim();
  return trimmed ? `Pagamento: ${trimmed}` : "Pagamento de conta a pagar";
}

function receivableDescription(description, clientName) {
  const base =
    String(description ?? "").trim() ||
    (String(clientName ?? "").trim()
      ? `Recebimento — ${String(clientName).trim()}`
      : "");
  return base ? `Recebimento: ${base}` : "Recebimento de conta a receber";
}

async function main() {
  console.log(
    apply
      ? "=== BACKFILL financial_movements (APPLY) ==="
      : "=== DRY-RUN backfill financial_movements ==="
  );

  const { error: tableErr } = await admin
    .from("financial_movements")
    .select("id", { count: "exact", head: true });
  if (tableErr) {
    console.error(
      "Tabela financial_movements indisponível. Aplique a migration 20261005100000_financial_movements.sql primeiro."
    );
    console.error(tableErr.message);
    process.exit(1);
  }

  const existingPayables = await loadExistingSourceIds("payable");
  const existingReceivables = await loadExistingSourceIds("receivable");

  const { data: payables, error: apErr } = await admin
    .from("accounts_payable")
    .select(
      "id, tenant_id, description, original_amount, payment_date, purchase_order_id, status"
    )
    .eq("status", "paid")
    .not("payment_date", "is", null);
  if (apErr) throw apErr;

  const { data: receivables, error: rErr } = await admin
    .from("receivables")
    .select(
      "id, tenant_id, description, client_name, paid_amount, payment_date, sales_order_id, status"
    )
    .in("status", ["paid", "partial"])
    .not("payment_date", "is", null)
    .gt("paid_amount", 0);
  if (rErr) throw rErr;

  const payableRows = (payables ?? []).filter((row) => !existingPayables.has(row.id));
  const receivableRows = (receivables ?? []).filter(
    (row) => !existingReceivables.has(row.id)
  );

  const payableInserts = payableRows.map((row) => ({
    tenant_id: row.tenant_id,
    direction: "out",
    amount: roundMoney(row.original_amount),
    movement_date: String(row.payment_date).slice(0, 10),
    source_kind: "payable",
    source_id: row.id,
    description: payableDescription(row.description),
    reference_id: row.purchase_order_id,
    created_by: null,
  }));

  const receivableInserts = receivableRows.map((row) => ({
    tenant_id: row.tenant_id,
    direction: "in",
    amount: roundMoney(row.paid_amount),
    movement_date: String(row.payment_date).slice(0, 10),
    source_kind: "receivable",
    source_id: row.id,
    description: receivableDescription(row.description, row.client_name),
    reference_id: row.sales_order_id,
    created_by: null,
  }));

  const allInserts = [...payableInserts, ...receivableInserts];

  console.log("");
  console.log("Contas a pagar (paid + payment_date):", payableInserts.length);
  console.log(
    "Contas a receber (paid/partial + payment_date + paid_amount>0):",
    receivableInserts.length
  );
  console.log("TOTAL de linhas a inserir:", allInserts.length);
  console.log("");
  console.log("Amostra (até 5 payables):");
  for (const row of payableInserts.slice(0, 5)) {
    console.log(
      `  out | ${row.movement_date} | R$ ${row.amount.toFixed(2)} | ${row.description.slice(0, 60)}`
    );
  }
  console.log("Amostra (até 5 receivables):");
  for (const row of receivableInserts.slice(0, 5)) {
    console.log(
      `  in  | ${row.movement_date} | R$ ${row.amount.toFixed(2)} | ${row.description.slice(0, 60)}`
    );
  }

  if (!apply) {
    console.log("");
    console.log("Dry-run concluído. Para inserir: node scripts/backfill-financial-movements.mjs --apply");
    return;
  }

  if (!allInserts.length) {
    console.log("Nada a inserir.");
    return;
  }

  const batchSize = 200;
  let inserted = 0;
  for (let i = 0; i < allInserts.length; i += batchSize) {
    const chunk = allInserts.slice(i, i + batchSize);
    const { error } = await admin.from("financial_movements").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  console.log(`Inseridas ${inserted} linhas em financial_movements.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
