/**
 * Diagnóstico: receivables vs movimentação.
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

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  for (const on of ["PV-2026-0001", "PV-2026-0002"]) {
    const { data: so } = await admin
      .from("sales_orders")
      .select("id, order_number, status, total, delivered_at")
      .ilike("order_number", on)
      .maybeSingle();
    if (!so) {
      console.log(`\n${on}: PV não encontrado`);
      continue;
    }
    const { data: recs } = await admin
      .from("receivables")
      .select(
        "id, description, original_amount, current_amount, paid_amount, status, is_forecast, due_date, payment_date"
      )
      .eq("sales_order_id", so.id);
    console.log(`\n=== ${so.order_number} status=${so.status} total=${so.total} ===`);
    for (const r of recs ?? []) {
      console.log(r);
    }
    if (!recs?.length) console.log("  (sem receivables)");
  }

  const { data: allReal } = await admin
    .from("receivables")
    .select("id, description, status, is_forecast, current_amount, sales_order_id")
    .eq("is_forecast", false);
  console.log(`\n=== Total receivables is_forecast=false: ${allReal?.length ?? 0} ===`);
  for (const r of allReal ?? []) console.log(r);

  const { data: movs } = await admin
    .from("financial_movements")
    .select("id, movement_type, amount, description, movement_date, receivable_id")
    .eq("movement_type", "in")
    .order("movement_date", { ascending: false })
    .limit(5);
  console.log(`\n=== Últimas entradas movimentação ===`);
  for (const m of movs ?? []) console.log(m);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
