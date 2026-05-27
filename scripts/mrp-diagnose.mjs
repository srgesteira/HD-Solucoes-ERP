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
  auth: { persistSession: false },
});

const MP_CODES = ["MP-A10-001", "MP-A10-002", "MP-T00-001"];
const ORDER_NUMBER = "PV-2026-0001-rev01";
const FINISHED_CODE = "HD1-A11A11-001";

async function main() {
  const { data: mps } = await admin
    .from("products")
    .select("id, technical_code, name, product_nature, type")
    .in("technical_code", MP_CODES);
  console.log("\n=== MPs ===");
  console.table(mps ?? []);

  const mpIds = (mps ?? []).map((p) => p.id);

  if (mpIds.length) {
    const { data: poi } = await admin
      .from("purchase_order_items")
      .select(
        "id, product_id, quantity, status, purchase_order_id, sales_order_item_id, trace_key, unit_price"
      )
      .in("product_id", mpIds);
    console.log("\n=== purchase_order_items (MPs) ===");
    console.table(poi ?? []);
  }

  const { data: finished } = await admin
    .from("products")
    .select("id, technical_code, name, product_nature, has_composition, type")
    .eq("technical_code", FINISHED_CODE)
    .maybeSingle();

  console.log("\n=== Produto acabado ===");
  console.log(finished);

  if (finished?.id) {
    const { data: bom } = await admin
      .from("product_components")
      .select(
        "id, component_product_id, quantity, is_labor, component:products!product_components_component_product_id_fkey(technical_code, name, product_nature)"
      )
      .eq("parent_product_id", finished.id);
    console.log("\n=== BOM ===");
    for (const row of bom ?? []) {
      const c = Array.isArray(row.component) ? row.component[0] : row.component;
      console.log({
        component: c?.technical_code,
        name: c?.name,
        qty: row.quantity,
        is_labor: row.is_labor,
        nature: c?.product_nature,
      });
    }
  }

  const { data: so } = await admin
    .from("sales_orders")
    .select("id, order_number, mrp_processed, status, tenant_id")
    .eq("order_number", ORDER_NUMBER)
    .maybeSingle();

  console.log("\n=== Pedido venda ===");
  console.log(so);

  if (so?.id) {
    const { data: lines } = await admin
      .from("sales_order_items")
      .select("id, line_number, product_id, quantity, production_order_id")
      .eq("sales_order_id", so.id);
    console.log("\n=== Linhas ===");
    console.table(lines ?? []);

    const { data: reqs } = await admin
      .from("purchase_order_items")
      .select("id, product_id, quantity, status, purchase_order_id")
      .in(
        "sales_order_item_id",
        (lines ?? []).map((l) => l.id)
      );
    console.log("\n=== Requisições por linha do pedido ===");
    console.table(reqs ?? []);
  }

  if (mpIds.length) {
    const { data: inv } = await admin
      .from("inventory")
      .select("product_id, quantity_on_hand")
      .in("product_id", mpIds);
    console.log("\n=== Estoque MPs ===");
    console.table(inv ?? []);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
