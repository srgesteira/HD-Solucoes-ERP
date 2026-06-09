/**
 * Auditoria: inventory.quantity_on_hand vs soma de inventory_movements.
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

const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: products } = await admin
  .from("products")
  .select("id, technical_code, tenant_id");
const prodById = new Map((products ?? []).map((p) => [p.id, p]));

const { data: movs } = await admin
  .from("inventory_movements")
  .select("id, product_id, movement_type, quantity, reason");

const sumByProduct = new Map();
const badQtyMovs = [];
for (const m of movs ?? []) {
  const q = Number(m.quantity);
  if (m.movement_type === "out" && q < 0) {
    badQtyMovs.push(m);
  }
  if (m.movement_type === "in" && q < 0) {
    badQtyMovs.push(m);
  }
  const prev = sumByProduct.get(m.product_id) ?? 0;
  sumByProduct.set(
    m.product_id,
    round4(prev + signedMovementQuantity(m.movement_type, m.quantity))
  );
}

const { data: invRows } = await admin
  .from("inventory")
  .select("id, product_id, quantity_on_hand, tenant_id");

const invByProduct = new Map((invRows ?? []).map((r) => [r.product_id, r]));
const allProductIds = new Set([
  ...sumByProduct.keys(),
  ...invByProduct.keys(),
]);

const drifts = [];
for (const productId of allProductIds) {
  const prod = prodById.get(productId);
  const expected = round4(sumByProduct.get(productId) ?? 0);
  const inv = invByProduct.get(productId);
  const current = round4(Number(inv?.quantity_on_hand ?? 0));
  const drift = round4(current - expected);
  if (Math.abs(drift) >= 0.0001) {
    drifts.push({
      code: prod?.technical_code ?? productId,
      current,
      expected,
      drift,
      hasInv: Boolean(inv),
      movementCount: (movs ?? []).filter((m) => m.product_id === productId).length,
    });
  }
}

console.log("=== Movimentos com quantity negativa (convenção: qty positiva) ===");
for (const m of badQtyMovs) {
  const p = prodById.get(m.product_id);
  console.log(
    `${p?.technical_code ?? m.product_id}: ${m.movement_type} qty=${m.quantity} — ${m.reason?.slice(0, 60)}`
  );
}
if (!badQtyMovs.length) console.log("(nenhum)");

console.log("\n=== Desvio saldo vs extrato ===");
if (!drifts.length) {
  console.log("Tudo alinhado.");
} else {
  for (const d of drifts) {
    console.log(
      `${d.code}: on_hand ${d.current} → esperado ${d.expected} (drift ${d.drift}) [movs: ${d.movementCount}]`
    );
  }
}

console.log("\n=== Resumo inventário ===");
for (const row of invRows ?? []) {
  const p = prodById.get(row.product_id);
  const expected = round4(sumByProduct.get(row.product_id) ?? 0);
  console.log(
    `${p?.technical_code ?? row.product_id}: em_mão ${row.quantity_on_hand} | extrato ${expected}`
  );
}
