/**
 * Backfill: custo pousado (IPI + despesas) e total do pedido de compra.
 *
 * Dry-run (padrão):
 *   node scripts/backfill-purchase-landed-costs.mjs
 *
 * Aplicar (só após aprovação):
 *   APPLY=1 node scripts/backfill-purchase-landed-costs.mjs
 *
 * Requer .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 * Opcional: TENANT_ID
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.env.APPLY === "1";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key);

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function extrasTotal(order) {
  return (
    num(order.freight_cost) +
    num(order.insurance_cost) +
    num(order.other_costs) +
    num(order.total_tax_non_creditable)
  );
}

function computeTotal(order) {
  return Math.max(
    0,
    num(order.subtotal) -
      num(order.discount) +
      num(order.tax) +
      num(order.total_ipi) +
      extrasTotal(order)
  );
}

function landedUnit(item, order, orderSubtotal) {
  const subtotal = orderSubtotal > 0 ? orderSubtotal : 0;
  const extras = extrasTotal(order);
  let share = 0;
  if (subtotal > 0 && extras > 0) {
    share = round4((num(item.total_price) / subtotal) * extras);
  }
  const lineTotal = round4(num(item.total_price) + num(item.ipi_value) + share);
  const qty = num(item.quantity);
  if (qty <= 0) return 0;
  return round4(lineTotal / qty);
}

function fmt(n) {
  return Number(n).toFixed(4);
}

async function resolveTenantId() {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const { data, error } = await admin.from("tenants").select("id").limit(1);
  if (error) throw error;
  if (!data?.[0]?.id) throw new Error("Nenhum tenant encontrado.");
  return data[0].id;
}

async function main() {
  const tenantId = await resolveTenantId();
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"} | tenant: ${tenantId}\n`);

  const { data: orders, error: oErr } = await admin
    .from("purchase_orders")
    .select(
      "id, po_number, status, subtotal, discount, tax, total_ipi, freight_cost, insurance_cost, other_costs, total_tax_non_creditable, total"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "received");

  if (oErr) throw oErr;

  const totalFixes = [];
  const costFixes = [];

  for (const order of orders ?? []) {
    const expectedTotal = round4(computeTotal(order));
    const storedTotal = round4(num(order.total));
    if (Math.abs(expectedTotal - storedTotal) >= 0.01) {
      totalFixes.push({
        po_number: order.po_number,
        order_id: order.id,
        old_total: storedTotal,
        new_total: expectedTotal,
      });
    }

    const { data: items, error: iErr } = await admin
      .from("purchase_order_items")
      .select(
        "id, product_id, quantity, total_price, ipi_value, products:product_id(technical_code, cost_price)"
      )
      .eq("purchase_order_id", order.id)
      .eq("tenant_id", tenantId);

    if (iErr) throw iErr;

    const orderSubtotal = num(order.subtotal);
    for (const item of items ?? []) {
      if (!item.product_id) continue;
      const newCost = landedUnit(item, order, orderSubtotal);
      const oldCost = round4(num(item.products?.cost_price));
      if (Math.abs(newCost - oldCost) < 0.0001) continue;

      costFixes.push({
        po_number: order.po_number,
        technical_code: item.products?.technical_code ?? "?",
        product_id: item.product_id,
        qty: num(item.quantity),
        ipi: num(item.ipi_value),
        old_cost: oldCost,
        new_cost: newCost,
      });
    }
  }

  console.log("=== A) Total do pedido (purchase_orders.total) ===\n");
  if (totalFixes.length === 0) {
    console.log("(nenhuma alteração necessária)\n");
  } else {
    for (const row of totalFixes) {
      console.log(
        `${row.po_number}: total ${fmt(row.old_total)} → ${fmt(row.new_total)}`
      );
    }
    console.log(`\nTotal pedidos a corrigir: ${totalFixes.length}\n`);
  }

  console.log("=== B) Custo de lista (products.cost_price) — pedidos recebidos ===\n");
  if (costFixes.length === 0) {
    console.log("(nenhuma alteração necessária)\n");
  } else {
    for (const row of costFixes) {
      console.log(
        `${row.po_number} | ${row.technical_code} | custo ${fmt(row.old_cost)} → ${fmt(row.new_cost)} (IPI linha: ${fmt(row.ipi)}, qtd: ${row.qty})`
      );
    }
    console.log(`\nTotal produtos a corrigir: ${costFixes.length}\n`);
  }

  if (!APPLY) {
    console.log("Dry-run concluído. Para aplicar: APPLY=1 node scripts/backfill-purchase-landed-costs.mjs");
    return;
  }

  let appliedTotals = 0;
  for (const row of totalFixes) {
    const { error } = await admin
      .from("purchase_orders")
      .update({ total: row.new_total })
      .eq("id", row.order_id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    appliedTotals++;
  }

  let appliedCosts = 0;
  for (const row of costFixes) {
    const { error } = await admin
      .from("products")
      .update({ cost_price: row.new_cost })
      .eq("id", row.product_id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    appliedCosts++;
  }

  console.log(`Aplicado: ${appliedTotals} totais de pedido, ${appliedCosts} custos de produto.`);
  console.log(
    "Nota: histórico product_price_history não foi reescrito — apenas cost_price actual."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
