/**
 * Grava quantity positiva em movimentos in/out (convenção do ERP).
 * Uso: node scripts/normalize-movement-quantities.mjs [--apply]
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
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: movs, error } = await admin
  .from("inventory_movements")
  .select("id, movement_type, quantity, reason, product_id")
  .in("movement_type", ["in", "out"]);

if (error) throw new Error(error.message);

const toFix = (movs ?? []).filter((m) => Number(m.quantity) < 0);
if (!toFix.length) {
  console.log("Nenhum movimento com quantity negativa.");
  process.exit(0);
}

console.log(`Encontrados ${toFix.length} movimento(s) com quantity negativa:`);
for (const m of toFix) {
  const next = Math.abs(Number(m.quantity));
  console.log(`  ${m.id.slice(0, 8)}… ${m.movement_type} ${m.quantity} → ${next}`);
  if (apply) {
    const { error: upErr } = await admin
      .from("inventory_movements")
      .update({ quantity: next })
      .eq("id", m.id);
    if (upErr) throw new Error(upErr.message);
  }
}

if (!apply) console.log("\nDry-run. Use --apply para gravar.");
