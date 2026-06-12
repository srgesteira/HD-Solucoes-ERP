/**
 * Smoke: 4 estados de estoque no MRP — OP acabado (10 em produção) + venda (5).
 * Compara shortage legacy (só on_hand) vs fórmula completa (available).
 *
 * Uso: node scripts/smoke-inventory-mrp-op-sale.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const TENANT = process.env.TENANT_ID ?? "d19658e2-3372-483d-abd0-9e486f945151";

function loadEnv() {
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
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey);

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

async function fetchAvailability(productId) {
  const { data: inv } = await admin
    .from("inventory")
    .select("quantity_on_hand, reserved_quantity")
    .eq("tenant_id", TENANT)
    .eq("product_id", productId)
    .maybeSingle();

  const onHand = Number(inv?.quantity_on_hand ?? 0);
  const reserved = Number(inv?.reserved_quantity ?? 0);

  const { data: prodRows } = await admin
    .from("order_items")
    .select(
      "quantity, apontamento_end_at, completed_at, status, production_orders!inner(status)"
    )
    .eq("tenant_id", TENANT)
    .eq("product_id", productId)
    .eq("is_suggestion", false)
    .in("production_orders.status", [
      "imported",
      "planning",
      "in_production",
      "ready",
      "delayed",
    ]);

  let inProd = 0;
  for (const row of prodRows ?? []) {
    if (row.apontamento_end_at || row.completed_at || row.status === "completed")
      continue;
    inProd += Number(row.quantity ?? 0);
  }

  const { data: poiRows } = await admin
    .from("purchase_order_items")
    .select(
      "quantity, received_quantity, purchase_orders!inner(status, is_suggestion)"
    )
    .eq("tenant_id", TENANT)
    .eq("product_id", productId);

  let incoming = 0;
  for (const row of poiRows ?? []) {
    const po = Array.isArray(row.purchase_orders)
      ? row.purchase_orders[0]
      : row.purchase_orders;
    if (!po || po.is_suggestion) continue;
    if (!["confirmed", "partial", "sent"].includes(String(po.status ?? "")))
      continue;
    incoming += Math.max(
      0,
      Number(row.quantity ?? 0) - Number(row.received_quantity ?? 0)
    );
  }

  const available = Math.max(0, onHand + incoming + inProd - reserved);
  return { onHand, reserved, inProd: round4(inProd), incoming: round4(incoming), available: round4(available) };
}

async function main() {
  console.log("=== Smoke: 4 estados MRP (OP + venda) ===\n");

  const { data: activeOps } = await admin
    .from("production_orders")
    .select("id, order_number, status, source_kind")
    .eq("tenant_id", TENANT)
    .eq("is_suggestion", false)
    .in("status", ["imported", "planning", "in_production", "ready", "delayed"])
    .limit(5);

  if (!activeOps?.length) {
    console.log("Nenhuma OP activa — smoke informativo apenas (sem falha).");
    process.exit(0);
  }

  let tested = 0;
  for (const op of activeOps) {
    const { data: items } = await admin
      .from("order_items")
      .select("id, product_id, quantity, product:products(technical_code, name)")
      .eq("tenant_id", TENANT)
      .eq("order_id", op.id)
      .eq("is_suggestion", false)
      .is("apontamento_end_at", null)
      .is("completed_at", null)
      .limit(3);

    for (const item of items ?? []) {
      if (!item.product_id) continue;
      const needed = 5;
      const avail = await fetchAvailability(item.product_id);
      const shortageLegacy = round4(Math.max(0, needed - avail.onHand));
      const shortageFull = round4(Math.max(0, needed - avail.available));
      const prod = Array.isArray(item.product) ? item.product[0] : item.product;

      console.log(
        `OP ${op.order_number} | ${prod?.technical_code ?? item.product_id} | qty OP=${item.quantity}`
      );
      console.log(
        `  on_hand=${avail.onHand} in_prod=${avail.inProd} incoming=${avail.incoming} reserved=${avail.reserved} → available=${avail.available}`
      );
      console.log(
        `  needed=${needed} | shortage_legacy=${shortageLegacy} | shortage_4estados=${shortageFull}`
      );

      if (avail.inProd >= needed && shortageLegacy > 0 && shortageFull === 0) {
        console.log("  ✅ Caso OP cobre venda: legacy geraria OP/compra extra; 4 estados evita.\n");
      } else {
        console.log("  ℹ️  Sem divergência legacy vs 4 estados neste item.\n");
      }
      tested += 1;
    }
  }

  console.log(`Itens analisados: ${tested}`);
  console.log("Smoke concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
