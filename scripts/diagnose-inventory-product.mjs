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

const code = process.argv[2] ?? "MO-A11-001";
const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: prods, error: pErr } = await admin
  .from("products")
  .select("id, technical_code, tenant_id")
  .eq("technical_code", code);

if (pErr) throw new Error(pErr.message);
if (!prods?.length) {
  console.log("PRODUCT_NOT_FOUND");
  process.exit(0);
}

for (const prod of prods) {
  const { data: inv } = await admin
    .from("inventory")
    .select("quantity_on_hand, reserved_quantity")
    .eq("product_id", prod.id)
    .maybeSingle();

  const { data: movs } = await admin
    .from("inventory_movements")
    .select("id, movement_type, quantity, reason, created_at")
    .eq("product_id", prod.id)
    .order("created_at", { ascending: true });

  let sum = 0;
  for (const m of movs ?? []) {
    const q = Number(m.quantity);
    if (!Number.isFinite(q)) continue;
    if (m.movement_type === "in") sum += Math.abs(q);
    else if (m.movement_type === "out") sum -= Math.abs(q);
    else sum += q;
  }
  sum = Math.round((sum + Number.EPSILON) * 10000) / 10000;

  console.log(
    JSON.stringify(
      {
        technical_code: prod.technical_code,
        tenant_id: prod.tenant_id,
        product_id: prod.id,
        quantity_on_hand: inv?.quantity_on_hand ?? null,
        sum_from_movements: sum,
        drift: Number(inv?.quantity_on_hand ?? 0) - sum,
        movements: movs,
      },
      null,
      2
    )
  );
}
