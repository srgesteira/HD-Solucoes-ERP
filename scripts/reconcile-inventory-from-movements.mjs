/**
 * Alinha inventory.quantity_on_hand à soma dos inventory_movements.
 * Uso:
 *   node scripts/reconcile-inventory-from-movements.mjs           # dry-run todos
 *   node scripts/reconcile-inventory-from-movements.mjs MO-A11-001 # dry-run um código
 *   node scripts/reconcile-inventory-from-movements.mjs --apply MO-A11-001
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

function signedMovementQuantity(movementType, quantity) {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return 0;
  if (movementType === "in") return Math.abs(q);
  if (movementType === "out") return -Math.abs(q);
  return q;
}

function round4(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const codeFilter = args.find((a) => !a.startsWith("--")) ?? null;

const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let prodQuery = admin.from("products").select("id, technical_code, tenant_id");
if (codeFilter) prodQuery = prodQuery.eq("technical_code", codeFilter);
const { data: products, error: pErr } = await prodQuery;
if (pErr) throw new Error(pErr.message);

const productIds = (products ?? []).map((p) => p.id);
if (!productIds.length) {
  console.log("Nenhum produto encontrado.");
  process.exit(0);
}

const { data: movs, error: mErr } = await admin
  .from("inventory_movements")
  .select("product_id, movement_type, quantity")
  .in("product_id", productIds);
if (mErr) throw new Error(mErr.message);

const sumByProduct = new Map();
for (const m of movs ?? []) {
  const prev = sumByProduct.get(m.product_id) ?? 0;
  sumByProduct.set(
    m.product_id,
    round4(prev + signedMovementQuantity(m.movement_type, m.quantity))
  );
}

const { data: invRows, error: iErr } = await admin
  .from("inventory")
  .select("id, product_id, quantity_on_hand, tenant_id")
  .in("product_id", productIds);
if (iErr) throw new Error(iErr.message);

const invByProduct = new Map((invRows ?? []).map((r) => [r.product_id, r]));
const prodById = new Map((products ?? []).map((p) => [p.id, p]));

const allProductIds = new Set([
  ...sumByProduct.keys(),
  ...invByProduct.keys(),
]);

let changes = 0;
for (const productId of allProductIds) {
  const prod = prodById.get(productId);
  const expected = round4(sumByProduct.get(productId) ?? 0);
  const inv = invByProduct.get(productId);
  const current = round4(Number(inv?.quantity_on_hand ?? 0));
  const drift = round4(current - expected);
  if (Math.abs(drift) < 0.0001) continue;

  console.log(
    `${prod?.technical_code ?? productId}: on_hand ${current} → ${expected} (drift ${drift})`
  );
  changes += 1;

  if (!apply) continue;

  if (inv?.id) {
    const { error: upErr } = await admin
      .from("inventory")
      .update({ quantity_on_hand: expected })
      .eq("id", inv.id);
    if (upErr) throw new Error(upErr.message);
  } else if (prod) {
    const { error: insErr } = await admin.from("inventory").insert({
      tenant_id: prod.tenant_id,
      product_id: productId,
      quantity_on_hand: expected,
      reserved_quantity: 0,
      reorder_point: 0,
      reorder_quantity: 0,
    });
    if (insErr) throw new Error(insErr.message);
  }
}

if (!changes) console.log("Nenhum desvio encontrado.");
else if (!apply) console.log("\nDry-run. Use --apply para gravar.");
else console.log(`\n${changes} saldo(s) actualizado(s).`);
