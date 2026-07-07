/**
 * Efetiva receivables (is_forecast=false) para PVs entregues e títulos já pagos.
 *
 * Dry-run: node scripts/backfill-delivered-receivables-real.mjs
 * Aplicar: node scripts/backfill-delivered-receivables-real.mjs --apply
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
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: delivered } = await admin
    .from("sales_orders")
    .select("id, order_number")
    .eq("status", "delivered");

  const deliveredIds = new Set((delivered ?? []).map((s) => s.id));

  const { data: forecast } = await admin
    .from("receivables")
    .select(
      "id, description, status, is_forecast, sales_order_id, current_amount, original_amount"
    )
    .eq("is_forecast", true);

  const toReal = (forecast ?? []).filter((r) => {
    if (r.status === "paid") return true;
    if (r.sales_order_id && deliveredIds.has(r.sales_order_id)) return true;
    return false;
  });

  console.log(
    apply
      ? "=== APLICANDO efetivação receivables ==="
      : "=== DRY-RUN efetivação receivables ==="
  );
  console.log(`PVs entregues: ${deliveredIds.size}`);
  console.log(`Títulos a efetivar: ${toReal.length}\n`);

  for (const r of toReal) {
    const so = (delivered ?? []).find((s) => s.id === r.sales_order_id);
    console.log(
      `  ${r.description?.slice(0, 50)} | ${r.status} | R$ ${r.current_amount} | SO=${so?.order_number ?? r.sales_order_id ?? "órfão"}`
    );
  }

  if (!apply || toReal.length === 0) {
    if (!apply && toReal.length > 0) {
      console.log("\nPara aplicar: node scripts/backfill-delivered-receivables-real.mjs --apply");
    }
    return;
  }

  const ids = toReal.map((r) => r.id);
  const { data, error } = await admin
    .from("receivables")
    .update({ is_forecast: false })
    .in("id", ids)
    .select("id");

  if (error) throw new Error(error.message);
  console.log(`\nEfetivados: ${data?.length ?? 0}`);

  const { count } = await admin
    .from("receivables")
    .select("id", { count: "exact", head: true })
    .eq("is_forecast", false);
  console.log(`Total reais agora: ${count ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
