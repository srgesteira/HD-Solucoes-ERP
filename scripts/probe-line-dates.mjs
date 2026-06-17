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
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val;
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const TENANT = process.env.TENANT_ID ?? "d19658e2-3372-483d-abd0-9e486f945151";
const LINE = "0054c10a-7a5d-4798-80dc-d95bde584619";
const ORDER = process.argv[2] ?? "PV-2026-0003";

const { data: so } = await admin
  .from("sales_orders")
  .select("id, order_number, status, mrp_processed")
  .eq("tenant_id", TENANT)
  .eq("order_number", ORDER)
  .maybeSingle();

console.log("SO:", so);
if (!so) process.exit(0);

const { data: soi } = await admin
  .from("sales_order_items")
  .select(
    "id, line_number, product_id, production_order_id, products:products!sales_order_items_product_id_fkey(technical_code, name, default_production_line_id)"
  )
  .eq("sales_order_id", so.id)
  .eq("tenant_id", TENANT);

for (const row of soi ?? []) {
  const prod = Array.isArray(row.products) ? row.products[0] : row.products;
  const { data: oiAll } = await admin
    .from("order_items")
    .select(
      "id, line_id, is_suggestion, status, production_start, production_end, sales_order_item_id"
    )
    .eq("tenant_id", TENANT)
    .eq("sales_order_item_id", row.id);

  const { data: oiReal } = await admin
    .from("order_items")
    .select("id, is_suggestion")
    .eq("tenant_id", TENANT)
    .eq("sales_order_item_id", row.id)
    .eq("is_suggestion", false);

  const { data: oiAny } = await admin
    .from("order_items")
    .select("id, is_suggestion")
    .eq("tenant_id", TENANT)
    .eq("sales_order_item_id", row.id);

  const planningOi =
    oiReal?.[0] ??
    (oiAny ?? []).find((x) => x.is_suggestion === true) ??
    null;

  console.log({
    line: row.line_number,
    code: prod?.technical_code,
    default_line: prod?.default_production_line_id,
    matches_mtg: prod?.default_production_line_id === LINE,
    production_order_id: row.production_order_id,
    order_items_all: oiAll,
    order_items_real: oiReal,
    planning_order_item_id: planningOi?.id ?? null,
    inputs_would_disable_before_fix: !oiReal?.length,
    inputs_enabled_after_fix: Boolean(planningOi?.id),
  });
}
