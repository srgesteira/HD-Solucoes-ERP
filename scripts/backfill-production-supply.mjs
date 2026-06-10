/**
 * Baixa componentes (BOM) em itens de OP já finalizados sem abastecimento.
 * Uso:
 *   node scripts/backfill-production-supply.mjs
 *   node scripts/backfill-production-supply.mjs --apply
 *   node scripts/backfill-production-supply.mjs --apply --line=0054c10a-7a5d-4798-80dc-d95bde584619
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

function round4(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowNegative = args.includes("--allow-negative");
const lineArg = args.find((a) => a.startsWith("--line="));
const lineId = lineArg ? lineArg.split("=")[1] : null;

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCTION_SUPPLY = "production_supply";

async function productHasBom(tenantId, productId, cache) {
  if (cache.has(productId)) return cache.get(productId);
  const { count, error } = await admin
    .from("product_components")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("parent_product_id", productId);
  if (error) throw error;
  const has = (count ?? 0) > 0;
  cache.set(productId, has);
  return has;
}

async function collectMaterialNeeds(
  tenantId,
  productId,
  multiplier,
  acc,
  stack,
  bomCache
) {
  if (stack.has(productId)) return;
  stack.add(productId);

  const hasBom = await productHasBom(tenantId, productId, bomCache);
  if (!hasBom) {
    acc.set(productId, round4((acc.get(productId) ?? 0) + multiplier));
    stack.delete(productId);
    return;
  }

  const { data: lines, error } = await admin
    .from("product_components")
    .select("component_product_id, quantity")
    .eq("tenant_id", tenantId)
    .eq("parent_product_id", productId);
  if (error) throw error;

  for (const row of lines ?? []) {
    if (!row.component_product_id) continue;
    const cid = row.component_product_id;
    const q = Number(row.quantity ?? 0) * multiplier;
    if (!Number.isFinite(q) || q <= 0) continue;
    const childHasBom = await productHasBom(tenantId, cid, bomCache);
    if (childHasBom) {
      await collectMaterialNeeds(tenantId, cid, q, acc, stack, bomCache);
    } else {
      acc.set(cid, round4((acc.get(cid) ?? 0) + q));
    }
  }
  stack.delete(productId);
}

async function filterPhysicalSupplyNeeds(tenantId, needs) {
  if (!needs.length) return [];
  const ids = [...new Set(needs.map((n) => n.product_id))];
  const { data: products, error } = await admin
    .from("products")
    .select("id, prefix:product_prefixes!products_prefix_id_fkey(code)")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) throw error;
  const laborIds = new Set();
  for (const p of products ?? []) {
    const prefix = Array.isArray(p.prefix) ? p.prefix[0] : p.prefix;
    if (prefix?.code === "MO") laborIds.add(p.id);
  }
  return needs.filter((n) => !laborIds.has(n.product_id));
}

async function calculateNeededMaterials(tenantId, productId, quantity) {
  const qty = Number(quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return [];
  const acc = new Map();
  await collectMaterialNeeds(
    tenantId,
    productId,
    qty,
    acc,
    new Set(),
    new Map()
  );
  const bomNeeds = [...acc.entries()].map(([product_id, gross_qty]) => ({
    product_id,
    gross_qty,
  }));
  return filterPhysicalSupplyNeeds(tenantId, bomNeeds);
}

async function movementExists(tenantId, referenceId, productId) {
  const { data } = await admin
    .from("inventory_movements")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reference_id", referenceId)
    .eq("product_id", productId)
    .eq("origin", PRODUCTION_SUPPLY)
    .eq("movement_type", "out")
    .limit(1);
  return Boolean(data?.length);
}

async function applyOutbound(tenantId, productId, qty, orderItemId, orderNumber) {
  if (await movementExists(tenantId, orderItemId, productId)) {
    return { skipped: true, productId, qty };
  }

  const { data: inv } = await admin
    .from("inventory")
    .select("id, quantity_on_hand")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  const prev = Number(inv?.quantity_on_hand ?? 0);
  if (!allowNegative && prev + 0.0001 < qty) {
    throw new Error(
      `Saldo insuficiente produto ${productId}: em mão ${prev}, necessário ${qty}`
    );
  }

  const next = prev - qty;
  if (inv?.id) {
    const { error } = await admin
      .from("inventory")
      .update({ quantity_on_hand: next })
      .eq("id", inv.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("inventory").insert({
      tenant_id: tenantId,
      product_id: productId,
      quantity_on_hand: next,
      reserved_quantity: 0,
      reorder_point: 0,
      reorder_quantity: 0,
    });
    if (error) throw error;
  }

  const { error: movErr } = await admin.from("inventory_movements").insert({
    tenant_id: tenantId,
    product_id: productId,
    movement_type: "out",
    quantity: qty,
    reason: `Abastecimento OP ${orderNumber} (correcção)`,
    reference_id: orderItemId,
    origin: PRODUCTION_SUPPLY,
  });
  if (movErr) throw movErr;
  return { posted: true, productId, qty };
}

async function supplyItem(tenantId, item, po) {
  if (item.warehouse_supplied_at) {
    return { status: "already_supplied" };
  }
  if (!item.product_id) return { status: "no_product" };

  const qty = Number(item.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return { status: "bad_qty" };

  const needs = await calculateNeededMaterials(
    tenantId,
    item.product_id,
    qty
  );

  const now = new Date().toISOString();

  if (!needs.length) {
    if (apply) {
      await admin
        .from("order_items")
        .update({ warehouse_supplied_at: now })
        .eq("id", item.id)
        .is("warehouse_supplied_at", null);
    }
    return { status: "no_bom", movements: 0 };
  }

  const movements = [];
  for (const need of needs) {
    if (apply) {
      movements.push(
        await applyOutbound(
          tenantId,
          need.product_id,
          need.gross_qty,
          item.id,
          po.order_number
        )
      );
    } else {
      movements.push({ product_id: need.product_id, qty: need.gross_qty });
    }
  }

  if (apply) {
    const { error } = await admin
      .from("order_items")
      .update({ warehouse_supplied_at: now })
      .eq("id", item.id)
      .is("warehouse_supplied_at", null);
    if (error) throw error;
  }

  return {
    status: apply ? "applied" : "dry_run",
    movements: movements.length,
    materials: movements,
  };
}

async function main() {
  const { data: tenants } = await admin.from("tenants").select("id, name");
  if (!tenants?.length) {
    console.log("Nenhum tenant.");
    return;
  }

  for (const tenant of tenants) {
    let query = admin
      .from("order_items")
      .select(
        `
        id,
        product_id,
        quantity,
        warehouse_supplied_at,
        completed_at,
        apontamento_end_at,
        status,
        line_id,
        product:products!order_items_product_id_fkey(technical_code, name),
        production_order:production_orders!order_items_order_id_fkey(
          id, order_number, status, is_suggestion
        )
      `.trim()
      )
      .eq("tenant_id", tenant.id)
      .eq("is_suggestion", false)
      .is("warehouse_supplied_at", null)
      .or(
        "completed_at.not.is.null,apontamento_end_at.not.is.null,status.eq.completed"
      );

    if (lineId) {
      query = query.eq("line_id", lineId);
    }

    const { data: items, error } = await query;
    if (error) {
      console.error("Erro:", error.message);
      continue;
    }

    const pending = (items ?? []).filter((raw) => {
      const po = Array.isArray(raw.production_order)
        ? raw.production_order[0]
        : raw.production_order;
      return po && !po.is_suggestion;
    });

    if (!pending.length) {
      console.log(`[${tenant.name}] Nenhum item pendente de abastecimento.`);
      continue;
    }

    console.log(
      `\n[${tenant.name}] ${pending.length} item(ns) finalizado(s) sem abastecimento${apply ? "" : " (dry-run)"}:`
    );

    for (const raw of pending) {
      const po = Array.isArray(raw.production_order)
        ? raw.production_order[0]
        : raw.production_order;
      const product = Array.isArray(raw.product) ? raw.product[0] : raw.product;
      const label = `${po.order_number} · ${product?.technical_code ?? "?"} · ${product?.name ?? "?"}`;
      try {
        const res = await supplyItem(tenant.id, raw, po);
        console.log(`  - ${label}:`, JSON.stringify(res));
      } catch (e) {
        console.error(`  - ${label}: ERRO`, e.message);
      }
    }
  }

  if (!apply) {
    console.log("\nExecute com --apply para registar as baixas.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
