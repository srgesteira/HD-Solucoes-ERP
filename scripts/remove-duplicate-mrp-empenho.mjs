/**
 * Remove saídas físicas legadas "Empenho MRP" (baixa só no abastecimento OP).
 * Uso:
 *   node scripts/remove-duplicate-mrp-empenho.mjs           # dry-run
 *   node scripts/remove-duplicate-mrp-empenho.mjs --apply  # aplica
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

async function reconcileProduct(admin, tenantId, productId) {
  const { data: movs, error: mErr } = await admin
    .from("inventory_movements")
    .select("movement_type, quantity")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);
  if (mErr) throw new Error(mErr.message);

  let sum = 0;
  for (const m of movs ?? []) {
    sum = round4(sum + signedMovementQuantity(m.movement_type, Number(m.quantity)));
  }

  const { data: existing } = await admin
    .from("inventory")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("inventory")
      .update({ quantity_on_hand: sum })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else if (Math.abs(sum) > 0.0001) {
    const { data: prod } = await admin
      .from("products")
      .select("tenant_id")
      .eq("id", productId)
      .maybeSingle();
    const { error } = await admin.from("inventory").insert({
      tenant_id: prod?.tenant_id ?? tenantId,
      product_id: productId,
      quantity_on_hand: sum,
      reserved_quantity: 0,
      reorder_point: 0,
      reorder_quantity: 0,
    });
    if (error) throw new Error(error.message);
  }

  return sum;
}

const apply = process.argv.includes("--apply");
const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: empenhos, error: eErr } = await admin
  .from("inventory_movements")
  .select("id, product_id, quantity, reason, reference_id, tenant_id")
  .eq("movement_type", "out")
  .ilike("reason", "Empenho MRP%");

if (eErr) throw new Error(eErr.message);

const toDelete = empenhos ?? [];

if (!toDelete.length) {
  console.log("Nenhum movimento Empenho MRP encontrado.");
  process.exit(0);
}

console.log(`Encontrados ${toDelete.length} movimento(s) Empenho MRP (saída física indevida):`);
for (const row of toDelete) {
  console.log(`  - ${row.reason} | produto ${row.product_id} | qty ${row.quantity}`);
}

if (!apply) {
  console.log("\nDry-run. Use --apply para remover e reconciliar saldos.");
  process.exit(0);
}

const productIds = new Set();
for (const row of toDelete) {
  const { error } = await admin
    .from("inventory_movements")
    .delete()
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  productIds.add(row.product_id);
}

for (const productId of productIds) {
  const tenantId = toDelete.find((r) => r.product_id === productId)?.tenant_id;
  const sum = await reconcileProduct(admin, tenantId, productId);
  console.log(`Reconciliado produto ${productId}: saldo ${sum}`);
}

console.log(`\n${toDelete.length} movimento(s) removido(s).`);
