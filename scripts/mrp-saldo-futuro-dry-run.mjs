/**
 * Dry-run A.1/A.2: compara saldo_futuro novo vs available legado e shortage.
 * Uso: node scripts/mrp-saldo-futuro-dry-run.mjs
 * ⛔ Somente leitura — não altera dados.
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
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function round4(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function includesProduction(nature) {
  const n = nature?.trim() ?? "";
  return n === "AC" || n === "SE";
}

function legacyAvailable(onHand, incoming, inProd, reserved) {
  return round4(Math.max(0, onHand + incoming + inProd - reserved));
}

function saldoFuturo(onHand, incoming, incomingDraft, inProd, reserved, nature) {
  const prod = includesProduction(nature) ? inProd : 0;
  return round4(onHand + prod + incoming + incomingDraft - reserved);
}

function purchaseQtyFromMin(saldo, reorderPoint, reorderQty) {
  const minimum = reorderPoint ?? 0;
  if (saldo >= minimum - 0.0001) return 0;
  const gap = round4(minimum - saldo);
  const lot = reorderQty ?? 0;
  if (lot > 0 && lot > gap) return round4(lot);
  return gap;
}

function newShortage(needed, saldo, reorderPoint, reorderQty) {
  const bom = round4(Math.max(0, needed - saldo));
  const min = purchaseQtyFromMin(saldo, reorderPoint, reorderQty);
  return round4(Math.max(bom, min));
}

function legacyShortage(needed, available) {
  return round4(Math.max(0, needed - available));
}

const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ORDERS = ["PV-2026-0003", "PV-2026-0004"];

async function loadAvailability(tenantId, productIds) {
  const ids = [...new Set(productIds)];
  const map = new Map();

  const { data: prods } = await admin
    .from("products")
    .select("id, product_nature, technical_code, name")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  const meta = new Map((prods ?? []).map((p) => [p.id, p]));

  const { data: invRows } = await admin
    .from("inventory")
    .select(
      "product_id, quantity_on_hand, reserved_quantity, reorder_point, reorder_quantity"
    )
    .eq("tenant_id", tenantId)
    .in("product_id", ids);

  const inProd = new Map();
  const { data: oiRows } = await admin
    .from("order_items")
    .select(
      "product_id, quantity, apontamento_end_at, completed_at, status, production_orders!inner(status)"
    )
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .in("product_id", ids)
    .in("production_orders.status", [
      "imported",
      "planning",
      "in_production",
      "ready",
      "delayed",
    ]);
  for (const row of oiRows ?? []) {
    if (!row.product_id || row.apontamento_end_at || row.completed_at) continue;
    if (row.status === "completed") continue;
    const q = Number(row.quantity ?? 0);
    if (q <= 0) continue;
    inProd.set(row.product_id, round4((inProd.get(row.product_id) ?? 0) + q));
  }

  const incoming = new Map();
  const { data: poiRows } = await admin
    .from("purchase_order_items")
    .select(
      "product_id, quantity, received_quantity, purchase_orders!inner(status, is_suggestion)"
    )
    .eq("tenant_id", tenantId)
    .in("product_id", ids)
    .not("purchase_order_id", "is", null);
  for (const row of poiRows ?? []) {
    const po = Array.isArray(row.purchase_orders)
      ? row.purchase_orders[0]
      : row.purchase_orders;
    if (!po?.status || po.is_suggestion) continue;
    if (!["confirmed", "partial", "sent"].includes(po.status)) continue;
    const pending = Math.max(
      0,
      Number(row.quantity ?? 0) - Number(row.received_quantity ?? 0)
    );
    if (pending <= 0) continue;
    incoming.set(
      row.product_id,
      round4((incoming.get(row.product_id) ?? 0) + pending)
    );
  }

  const draftIn = new Map();
  const { data: drafts } = await admin
    .from("purchase_order_items")
    .select("product_id, quantity")
    .eq("tenant_id", tenantId)
    .in("product_id", ids)
    .is("purchase_order_id", null)
    .eq("status", "draft");
  for (const row of drafts ?? []) {
    const q = Number(row.quantity ?? 0);
    if (q <= 0) continue;
    draftIn.set(
      row.product_id,
      round4((draftIn.get(row.product_id) ?? 0) + q)
    );
  }

  for (const id of ids) {
    const inv = (invRows ?? []).find((r) => r.product_id === id);
    const p = meta.get(id);
    const onHand = Number(inv?.quantity_on_hand ?? 0);
    const reserved = Number(inv?.reserved_quantity ?? 0);
    const inP = inProd.get(id) ?? 0;
    const inc = incoming.get(id) ?? 0;
    const incDraft = draftIn.get(id) ?? 0;
    const nature = p?.product_nature ?? null;
    const saldo = saldoFuturo(onHand, inc, incDraft, inP, reserved, nature);
    const avail = legacyAvailable(onHand, inc, inP, reserved);
    map.set(id, {
      code: p?.technical_code ?? id.slice(0, 8),
      name: p?.name ?? "",
      nature,
      onHand,
      reserved,
      inProd: inP,
      incoming: inc,
      incomingDraft: incDraft,
      reorder_point: Number(inv?.reorder_point ?? 0),
      reorder_quantity: Number(inv?.reorder_quantity ?? 0),
      saldo_futuro: saldo,
      available_legacy: avail,
    });
  }
  return map;
}

async function grossNeedsForOrder(tenantId, salesOrderId) {
  const { data: items } = await admin
    .from("sales_order_items")
    .select("product_id, quantity")
    .eq("sales_order_id", salesOrderId)
    .eq("tenant_id", tenantId);
  const needs = new Map();
  for (const it of items ?? []) {
    if (!it.product_id) continue;
    const qty = Number(it.quantity ?? 0);
    if (qty <= 0) continue;
    const { data: bom } = await admin
      .from("product_components")
      .select("component_product_id, quantity")
      .eq("tenant_id", tenantId)
      .eq("parent_product_id", it.product_id);
    if (!bom?.length) {
      needs.set(
        it.product_id,
        round4((needs.get(it.product_id) ?? 0) + qty)
      );
      continue;
    }
    for (const line of bom) {
      if (!line.component_product_id) continue;
      const q = qty * Number(line.quantity ?? 0);
      if (q <= 0) continue;
      needs.set(
        line.component_product_id,
        round4((needs.get(line.component_product_id) ?? 0) + q)
      );
    }
  }
  return needs;
}

async function countDraftsByProduct(tenantId, productIds) {
  const { data } = await admin
    .from("purchase_order_items")
    .select("product_id, id, quantity")
    .eq("tenant_id", tenantId)
    .in("product_id", productIds)
    .is("purchase_order_id", null)
    .eq("status", "draft");
  const byProduct = new Map();
  for (const row of data ?? []) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  return byProduct;
}

async function main() {
  const { data: orders } = await admin
    .from("sales_orders")
    .select("id, order_number, tenant_id, status, mrp_processed")
    .in("order_number", ORDERS);

  console.log("\n=== PEDIDOS ===");
  console.table(orders ?? []);

  const allProductIds = new Set();
  const needsByOrder = new Map();

  for (const so of orders ?? []) {
    const needs = await grossNeedsForOrder(so.tenant_id, so.id);
    needsByOrder.set(so.order_number, needs);
    for (const pid of needs.keys()) allProductIds.add(pid);
  }

  const tenantId = orders?.[0]?.tenant_id;
  if (!tenantId) {
    console.log("Nenhum pedido encontrado.");
    return;
  }

  const avail = await loadAvailability(tenantId, [...allProductIds]);

  console.log("\n=== DRY-RUN A.1/A.2: saldo_futuro vs legado ===");
  const rows = [];
  for (const [orderNumber, needs] of needsByOrder) {
    for (const [pid, needed] of needs) {
      const a = avail.get(pid);
      if (!a) continue;
      const shortageNew = newShortage(
        needed,
        a.saldo_futuro,
        a.reorder_point,
        a.reorder_quantity
      );
      const shortageOld = legacyShortage(needed, a.available_legacy);
      rows.push({
        pedido: orderNumber,
        codigo: a.code,
        natureza: a.nature,
        needed,
        on_hand: a.onHand,
        saldo_futuro: a.saldo_futuro,
        available_legado: a.available_legacy,
        reorder_point: a.reorder_point,
        shortage_novo: shortageNew,
        shortage_legado: shortageOld,
        delta: round4(shortageNew - shortageOld),
      });
    }
  }
  console.table(rows);

  console.log("\n=== A.3 IDEMPOTÊNCIA (estado actual drafts por produto) ===");
  const drafts = await countDraftsByProduct(tenantId, [...allProductIds]);
  const draftRows = [];
  for (const [pid, list] of drafts) {
    const a = avail.get(pid);
    draftRows.push({
      codigo: a?.code ?? pid.slice(0, 8),
      drafts_count: list.length,
      qty_total: round4(list.reduce((s, r) => s + Number(r.quantity ?? 0), 0)),
      ids: list.map((r) => r.id.slice(0, 8)).join(", "),
    });
  }
  if (!draftRows.length) console.log("(nenhum draft nos materiais destes pedidos)");
  else console.table(draftRows);

  const multiDraft = draftRows.filter((r) => r.drafts_count > 1);
  if (multiDraft.length) {
    console.log(
      "\n⚠️  Produtos com MAIS DE 1 draft (A.3 deve consolidar em futuras corridas):"
    );
    console.table(multiDraft);
  } else {
    console.log("\n✓ Nenhum produto com múltiplos drafts neste conjunto.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
