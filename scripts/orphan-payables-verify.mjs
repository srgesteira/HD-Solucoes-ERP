/**
 * Verifica AP dos PCs backfillados (is_forecast=false).
 * Uso: node scripts/orphan-payables-verify.mjs
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

const PO_NUMBERS = ["8/2026", "PV-2026-0002-1-MO-A11-003"];

async function main() {
  for (const poNumber of PO_NUMBERS) {
    const { data: po } = await admin
      .from("purchase_orders")
      .select("id, po_number, status, total, payment_installments")
      .eq("po_number", poNumber)
      .maybeSingle();
    if (!po) {
      console.log(`${poNumber}: PC não encontrado`);
      continue;
    }
    const { data: aps } = await admin
      .from("accounts_payable")
      .select("id, description, original_amount, status, is_forecast")
      .eq("purchase_order_id", po.id);
    const allReal = (aps ?? []).every((a) => a.is_forecast === false);
    const sum = (aps ?? []).reduce((s, a) => s + Number(a.original_amount), 0);
    console.log(`\n=== ${po.po_number} ===`);
    console.log(`status=${po.status} total=${po.total} installments_cfg=${po.payment_installments}`);
    console.log(`AP count=${aps?.length ?? 0} sum=${sum.toFixed(2)} all_is_forecast_false=${allReal}`);
    if ((aps?.length ?? 0) <= 3) {
      for (const a of aps ?? []) console.log(`  ${a.description} | ${a.original_amount} | forecast=${a.is_forecast}`);
    } else {
      console.log(`  (amostra) ${aps[0].description} ... ${aps[aps.length - 1].description}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
