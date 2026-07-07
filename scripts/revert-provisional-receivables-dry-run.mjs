/**
 * Dry-run / backfill: reverte recebíveis para provisório (is_forecast=true)
 * quando o pedido de venda ainda NÃO está entregue (status != delivered).
 *
 * Uso:
 *   node scripts/revert-provisional-receivables-dry-run.mjs           # dry-run
 *   node scripts/revert-provisional-receivables-dry-run.mjs --apply   # UPDATE
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
  const { data: receivables, error: rErr } = await admin
    .from("receivables")
    .select(
      "id, tenant_id, sales_order_id, document_number, description, client_name, current_amount, due_date, status, is_forecast"
    )
    .eq("is_forecast", false)
    .eq("status", "pending")
    .not("sales_order_id", "is", null);

  if (rErr) {
    console.error("Erro ao listar recebíveis:", rErr.message);
    process.exit(1);
  }

  const rows = receivables ?? [];
  if (rows.length === 0) {
    console.log("Nenhum recebível pendente com is_forecast=false.");
    return;
  }

  const orderIds = [...new Set(rows.map((r) => r.sales_order_id).filter(Boolean))];

  const { data: orders, error: oErr } = await admin
    .from("sales_orders")
    .select("id, order_number, client_name, status")
    .in("id", orderIds);

  if (oErr) {
    console.error("Erro ao listar pedidos:", oErr.message);
    process.exit(1);
  }

  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const toRevert = rows.filter((r) => {
    const o = orderById.get(r.sales_order_id);
    return o?.status !== "delivered";
  });

  const keptReal = rows.filter((r) => {
    const o = orderById.get(r.sales_order_id);
    return o?.status === "delivered";
  });

  console.log(
    apply
      ? "=== APLICANDO backfill (is_forecast → true) ==="
      : "=== DRY-RUN: recebíveis a reverter para provisório ==="
  );
  console.log(`Critério: pedido ainda NÃO entregue (status != delivered)`);
  console.log(`Total candidatos (pending, is_forecast=false, com PV): ${rows.length}`);
  console.log(`Pedidos já entregues (mantêm real): ${keptReal.length} título(s)`);
  console.log(`Títulos a reverter: ${toRevert.length}\n`);

  if (keptReal.length > 0) {
    console.log("--- Mantidos como real (PV delivered) ---");
    for (const r of keptReal) {
      const o = orderById.get(r.sales_order_id);
      console.log(
        [
          `id=${r.id}`,
          `PV=${o?.order_number ?? r.sales_order_id}`,
          `cliente=${r.client_name ?? o?.client_name ?? "?"}`,
          `pv_status=${o?.status ?? "?"}`,
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
    const o = orderById.get(r.sales_order_id);
    console.log(
      [
        `id=${r.id}`,
        `PV=${o?.order_number ?? r.sales_order_id}`,
        `cliente=${r.client_name ?? o?.client_name ?? "?"}`,
        `valor=${r.current_amount}`,
        `venc=${r.due_date}`,
        `pv_status=${o?.status ?? "?"}`,
      ].join(" | ")
    );
  }

  if (!apply) {
    console.log("\nPara aplicar: node scripts/revert-provisional-receivables-dry-run.mjs --apply");
    return;
  }

  const ids = toRevert.map((r) => r.id);
  const { data: updated, error: uErr } = await admin
    .from("receivables")
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
