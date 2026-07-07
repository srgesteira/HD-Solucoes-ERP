/**
 * Dry-run / backfill: reverte pagáveis para provisório (is_forecast=true)
 * quando o pedido de compra ainda NÃO foi recebido (status != received).
 *
 * Uso:
 *   node scripts/revert-provisional-payables-dry-run.mjs           # dry-run
 *   node scripts/revert-provisional-payables-dry-run.mjs --apply   # UPDATE
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

async function main() {
  const { data: payables, error: pErr } = await admin
    .from("accounts_payable")
    .select(
      "id, tenant_id, purchase_order_id, description, original_amount, current_amount, due_date, status, is_forecast"
    )
    .eq("is_forecast", false)
    .eq("status", "pending")
    .not("purchase_order_id", "is", null);

  if (pErr) {
    console.error("Erro ao listar pagáveis:", pErr.message);
    process.exit(1);
  }

  const rows = payables ?? [];
  if (rows.length === 0) {
    console.log("Nenhum pagável pendente com is_forecast=false e PC vinculado.");
    return;
  }

  const orderIds = [
    ...new Set(rows.map((r) => r.purchase_order_id).filter(Boolean)),
  ];

  const { data: orders, error: oErr } = await admin
    .from("purchase_orders")
    .select("id, po_number, supplier_id, status")
    .in("id", orderIds);

  if (oErr) {
    console.error("Erro ao listar PCs:", oErr.message);
    process.exit(1);
  }

  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const toRevert = rows.filter((r) => {
    const o = orderById.get(r.purchase_order_id);
    return o?.status !== "received";
  });

  const keptReal = rows.filter((r) => {
    const o = orderById.get(r.purchase_order_id);
    return o?.status === "received";
  });

  console.log(
    apply
      ? "=== APLICANDO backfill compras (is_forecast → true) ==="
      : "=== DRY-RUN: pagáveis a reverter para provisório ==="
  );
  console.log(`Critério: PC ainda NÃO recebido (status != received)`);
  console.log(
    `Total candidatos (pending, is_forecast=false, com PC): ${rows.length}`
  );
  console.log(`PCs já recebidos (mantêm real): ${keptReal.length} título(s)`);
  console.log(`Títulos a reverter: ${toRevert.length}\n`);

  if (keptReal.length > 0) {
    console.log("--- Mantidos como real (PC received) ---");
    for (const r of keptReal) {
      const o = orderById.get(r.purchase_order_id);
      console.log(
        [
          `id=${r.id}`,
          `PC=${o?.po_number ?? r.purchase_order_id}`,
          `valor=${r.current_amount}`,
          `pc_status=${o?.status ?? "?"}`,
        ].join(" | ")
      );
    }
    console.log("");
  }

  if (toRevert.length === 0) {
    console.log("Nada a reverter.");
    return;
  }

  console.log("--- A reverter para provisório ---");
  for (const r of toRevert) {
    const o = orderById.get(r.purchase_order_id);
    console.log(
      [
        `id=${r.id}`,
        `PC=${o?.po_number ?? r.purchase_order_id}`,
        `desc=${r.description ?? "?"}`,
        `valor=${r.current_amount}`,
        `venc=${r.due_date}`,
        `pc_status=${o?.status ?? "?"}`,
      ].join(" | ")
    );
  }

  if (!apply) {
    console.log(
      "\nPara aplicar: node scripts/revert-provisional-payables-dry-run.mjs --apply"
    );
    return;
  }

  const ids = toRevert.map((r) => r.id);
  const { data: updated, error: uErr } = await admin
    .from("accounts_payable")
    .update({ is_forecast: true })
    .in("id", ids)
    .select("id");

  if (uErr) {
    console.error("Erro no UPDATE:", uErr.message);
    process.exit(1);
  }

  console.log(`\nAtualizados: ${(updated ?? []).length} título(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
