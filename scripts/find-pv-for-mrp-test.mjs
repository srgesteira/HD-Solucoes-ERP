/**
 * Read-only: encontra PVs com HD1-A11A11-001 / 002 para teste MRP no browser.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val;
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const TENANT = process.env.TENANT_ID ?? "d19658e2-3372-483d-abd0-9e486f945151";
const CODES = ["HD1-A11A11-001", "HD1-A11A11-002"];

const { data: products } = await admin
  .from("products")
  .select("id, technical_code, name")
  .eq("tenant_id", TENANT)
  .in("technical_code", CODES);

const byCode = new Map((products ?? []).map((p) => [p.technical_code, p]));
console.log("Produtos:\n");
for (const code of CODES) {
  const p = byCode.get(code);
  console.log(`  ${code}: ${p?.id ?? "N/A"}`);
}

const productIds = [...byCode.values()].map((p) => p.id);

const { data: soiRows } = await admin
  .from("sales_order_items")
  .select(
    `
    id, line_number, quantity, production_order_id,
    sales_order:sales_orders!inner(id, order_number, status, client_name, created_at),
    product:products!sales_order_items_product_id_fkey(technical_code, name)
  `
  )
  .eq("tenant_id", TENANT)
  .in("product_id", productIds)
  .order("created_at", { ascending: false, foreignTable: "sales_orders" });

console.log("\nPVs com esses produtos:\n");
const seen = new Set();
for (const row of soiRows ?? []) {
  const so = Array.isArray(row.sales_order) ? row.sales_order[0] : row.sales_order;
  const prod = Array.isArray(row.product) ? row.product[0] : row.product;
  if (!so || seen.has(so.id)) continue;
  seen.add(so.id);
  console.log(
    `  PV ${so.order_number} | status=${so.status} | ${so.client_name ?? "—"} | linha ${row.line_number}: ${prod?.technical_code} qty=${row.quantity} | OP=${row.production_order_id ? "sim" : "não"}`
  );
}

const { data: ops } = await admin
  .from("production_orders")
  .select("id, order_number, status, source_kind")
  .eq("tenant_id", TENANT)
  .eq("is_suggestion", false)
  .in("status", ["imported", "planning", "in_production", "ready", "delayed"]);

console.log("\nOPs activas:\n");
for (const op of ops ?? []) {
  const { data: items } = await admin
    .from("order_items")
    .select("quantity, product:products(technical_code)")
    .eq("order_id", op.id)
    .eq("is_suggestion", false);
  for (const it of items ?? []) {
    const p = Array.isArray(it.product) ? it.product[0] : it.product;
    console.log(`  ${op.order_number} | status=${op.status} | ${p?.technical_code} qty=${it.quantity}`);
  }
}

const { data: confirmed } = await admin
  .from("sales_orders")
  .select("id, order_number, status, mrp_processed, client_name")
  .eq("tenant_id", TENANT)
  .eq("status", "confirmed")
  .order("created_at", { ascending: false })
  .limit(5);

console.log("\nPVs confirmed (elegíveis MRP lote):\n");
for (const so of confirmed ?? []) {
  console.log(`  ${so.order_number} | id=${so.id} | mrp_processed=${so.mrp_processed}`);
}

console.log("\nURLs úteis (substitua ID):\n");
for (const row of soiRows ?? []) {
  const so = Array.isArray(row.sales_order) ? row.sales_order[0] : row.sales_order;
  if (!so) continue;
  console.log(`  PV ${so.order_number}: /sales/orders/${so.id} | MRP: /mrp?sales_order_id=${so.id}`);
  break;
}
for (const row of soiRows ?? []) {
  const so = Array.isArray(row.sales_order) ? row.sales_order[0] : row.sales_order;
  if (!so || so.order_number === "PV-2026-0001-rev01") continue;
  console.log(`  PV ${so.order_number}: /sales/orders/${so.id} | MRP: /mrp?sales_order_id=${so.id}`);
  break;
}
