/**
 * Backfill: unit_cost das linhas de BOM (material) + recálculo dos pais.
 *
 * Dry-run (padrão):
 *   node scripts/backfill-bom-unit-costs.mjs
 *
 * Aplicar (só após deploy e aprovação explícita):
 *   APPLY=1 node scripts/backfill-bom-unit-costs.mjs
 *
 * Com APPLY=1 corre um dry-run imediato antes de gravar; se a lista mudou, aborta.
 *
 * Requer .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 * Opcional: TENANT_ID
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.env.APPLY === "1";
const MAX_DEPTH = 32;

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
  return Number.isFinite(n) ? n : 0;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function fmt(n) {
  return Number(n).toFixed(4);
}

function signature(plan) {
  const payload = JSON.stringify({
    lines: plan.lines.map((r) => ({
      line_id: r.line_id,
      old: round4(r.old_unit_cost),
      new: round4(r.new_unit_cost),
    })),
    parents: plan.parents.map((r) => ({
      product_id: r.product_id,
      old: round4(r.old_cost),
      new: round4(r.new_cost),
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

async function resolveTenantId() {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const { data, error } = await admin.from("tenants").select("id").limit(1);
  if (error) throw error;
  if (!data?.[0]?.id) throw new Error("Nenhum tenant encontrado.");
  return data[0].id;
}

async function fetchOutOfSyncLines(tenantId) {
  const { data, error } = await admin
    .from("product_components")
    .select(
      `
      id,
      parent_product_id,
      component_product_id,
      quantity,
      unit_cost,
      parent:parent_product_id(technical_code),
      component:component_product_id(technical_code, cost_price)
    `
    )
    .eq("tenant_id", tenantId)
    .eq("is_labor", false)
    .not("component_product_id", "is", null);

  if (error) throw error;

  const lines = [];
  for (const row of data ?? []) {
    const catalog = round4(num(row.component?.cost_price));
    const stored = round4(num(row.unit_cost));
    if (Math.abs(catalog - stored) < 0.00005) continue;
    lines.push({
      line_id: row.id,
      parent_product_id: row.parent_product_id,
      component_product_id: row.component_product_id,
      parent_code: row.parent?.technical_code ?? "?",
      component_code: row.component?.technical_code ?? "?",
      quantity: num(row.quantity),
      old_unit_cost: stored,
      new_unit_cost: catalog,
    });
  }

  lines.sort((a, b) =>
    `${a.parent_code}|${a.component_code}`.localeCompare(
      `${b.parent_code}|${b.component_code}`
    )
  );
  return lines;
}

async function previewParentRecalcs(tenantId, affectedParentIds) {
  const parents = [];
  for (const parentId of [...affectedParentIds].sort()) {
    const { data: product, error: pErr } = await admin
      .from("products")
      .select("id, technical_code, cost_price")
      .eq("id", parentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!product) continue;

    const { data: comps, error: cErr } = await admin
      .from("product_components")
      .select(
        "quantity, unit_cost, is_labor, component_product_id, component:component_product_id(cost_price)"
      )
      .eq("parent_product_id", parentId)
      .eq("tenant_id", tenantId);
    if (cErr) throw cErr;

    let sum = 0;
    for (const c of comps ?? []) {
      const q = num(c.quantity);
      let unit = num(c.unit_cost);
      if (!c.is_labor && c.component_product_id) {
        unit = round4(num(c.component?.cost_price));
      }
      sum += q * unit;
    }

    const newCost = round4(sum);
    const oldCost = round4(num(product.cost_price));
    if (Math.abs(newCost - oldCost) < 0.00005) continue;

    parents.push({
      product_id: parentId,
      technical_code: product.technical_code ?? "?",
      old_cost: oldCost,
      new_cost: newCost,
    });
  }

  parents.sort((a, b) => a.technical_code.localeCompare(b.technical_code));
  return parents;
}

async function collectAncestorParents(tenantId, startParentIds) {
  const all = new Set(startParentIds);
  const queue = [...startParentIds];
  while (queue.length) {
    const pid = queue.shift();
    for (const gp of await findParents(tenantId, pid)) {
      if (!all.has(gp)) {
        all.add(gp);
        queue.push(gp);
      }
    }
  }
  return all;
}

async function buildPlan(tenantId) {
  const lines = await fetchOutOfSyncLines(tenantId);
  const directParents = lines.map((l) => l.parent_product_id);
  const allParents = await collectAncestorParents(tenantId, directParents);
  const parents = await previewParentRecalcs(tenantId, allParents);
  return { lines, parents, sig: signature({ lines, parents }) };
}

async function syncParentMaterialLines(tenantId, parentProductId) {
  const { data: lines, error: lineErr } = await admin
    .from("product_components")
    .select("id, component_product_id")
    .eq("parent_product_id", parentProductId)
    .eq("tenant_id", tenantId)
    .eq("is_labor", false);
  if (lineErr) throw lineErr;

  const material = (lines ?? []).filter((l) => l.component_product_id);
  if (!material.length) return 0;

  const ids = [...new Set(material.map((l) => l.component_product_id))];
  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (prodErr) throw prodErr;

  const costById = new Map(
    (products ?? []).map((p) => [p.id, round4(num(p.cost_price))])
  );

  let n = 0;
  for (const line of material) {
    const next = costById.get(line.component_product_id);
    if (next === undefined) continue;
    const { error } = await admin
      .from("product_components")
      .update({ unit_cost: next })
      .eq("id", line.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    n += 1;
  }
  return n;
}

async function hasPurchaseHistory(tenantId, productId) {
  const { count, error } = await admin
    .from("product_price_history")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("price_type", "purchase");
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function recalculateParentCostFixed(tenantId, parentProductId) {
  await syncParentMaterialLines(tenantId, parentProductId);

  const { data: comps, error } = await admin
    .from("product_components")
    .select("quantity, unit_cost")
    .eq("parent_product_id", parentProductId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  const total = round4(
    (comps ?? []).reduce((s, c) => s + num(c.quantity) * round4(num(c.unit_cost)), 0)
  );

  const hasPurchase = await hasPurchaseHistory(tenantId, parentProductId);
  if (!hasPurchase) {
    const { error: upErr } = await admin
      .from("products")
      .update({ cost_price: total })
      .eq("id", parentProductId)
      .eq("tenant_id", tenantId);
    if (upErr) throw upErr;
  }

  return total;
}

async function syncComponentLines(tenantId, componentProductId, unitCost) {
  const { data, error } = await admin
    .from("product_components")
    .update({ unit_cost: unitCost })
    .eq("tenant_id", tenantId)
    .eq("component_product_id", componentProductId)
    .eq("is_labor", false)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

async function findParents(tenantId, componentProductId) {
  const { data, error } = await admin
    .from("product_components")
    .select("parent_product_id")
    .eq("tenant_id", tenantId)
    .eq("component_product_id", componentProductId);
  if (error) throw error;
  return [
    ...new Set(
      (data ?? [])
        .map((r) => r.parent_product_id)
        .filter((id) => typeof id === "string" && id.length > 0)
    ),
  ];
}

async function propagateComponent(tenantId, componentProductId) {
  const { data: component, error: compErr } = await admin
    .from("products")
    .select("id, cost_price")
    .eq("id", componentProductId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (compErr) throw compErr;
  if (!component) return;

  const unitCost = round4(num(component.cost_price));
  await syncComponentLines(tenantId, componentProductId, unitCost);

  const queue = [];
  for (const parentId of await findParents(tenantId, componentProductId)) {
    queue.push({ parentId, depth: 0 });
  }

  const processed = new Set();

  while (queue.length) {
    const { parentId, depth } = queue.shift();
    if (processed.has(parentId) || depth >= MAX_DEPTH) continue;
    if (parentId === componentProductId) continue;
    processed.add(parentId);

    const newParentCost = await recalculateParentCostFixed(tenantId, parentId);
    await syncComponentLines(tenantId, parentId, round4(newParentCost));

    for (const gp of await findParents(tenantId, parentId)) {
      if (!processed.has(gp)) queue.push({ parentId: gp, depth: depth + 1 });
    }
  }
}

function printPlan(plan) {
  console.log("=== A) Linhas de composição (unit_cost material) ===\n");
  if (plan.lines.length === 0) {
    console.log("(nenhuma alteração necessária)\n");
  } else {
    for (const row of plan.lines) {
      console.log(
        `${row.parent_code} ← ${row.component_code} | unit_cost ${fmt(row.old_unit_cost)} → ${fmt(row.new_unit_cost)} (qtd ${row.quantity})`
      );
    }
    console.log(`\nTotal linhas a corrigir: ${plan.lines.length}\n`);
  }

  console.log("=== B) Produtos pai (cost_price recalculado da BOM) ===\n");
  if (plan.parents.length === 0) {
    console.log("(nenhuma alteração necessária)\n");
  } else {
    for (const row of plan.parents) {
      console.log(
        `${row.technical_code} | custo pai ${fmt(row.old_cost)} → ${fmt(row.new_cost)}`
      );
    }
    console.log(`\nTotal pais a recalcular: ${plan.parents.length}\n`);
  }

  console.log(`Assinatura do plano: ${plan.sig}\n`);
}

async function applyPlan(tenantId, plan) {
  for (const row of plan.lines) {
    const { error } = await admin
      .from("product_components")
      .update({ unit_cost: row.new_unit_cost })
      .eq("id", row.line_id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }

  const componentIds = [
    ...new Set(plan.lines.map((l) => l.component_product_id).filter(Boolean)),
  ];

  for (const cid of componentIds) {
    await propagateComponent(tenantId, cid);
  }

  console.log(
    `Aplicado: ${plan.lines.length} linhas de BOM, cascata em ${componentIds.length} componente(s) distinto(s).`
  );
}

async function main() {
  const tenantId = await resolveTenantId();
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"} | tenant: ${tenantId}\n`);

  if (!APPLY) {
    const plan = await buildPlan(tenantId);
    printPlan(plan);
    console.log(
      "Dry-run concluído. Para aplicar (após deploy): APPLY=1 node scripts/backfill-bom-unit-costs.mjs"
    );
    return;
  }

  console.log("--- Pré-confirmação (dry-run #1) ---\n");
  const plan1 = await buildPlan(tenantId);
  printPlan(plan1);

  if (plan1.lines.length === 0 && plan1.parents.length === 0) {
    console.log("Nada a aplicar.");
    return;
  }

  console.log("--- Pré-confirmação (dry-run #2, imediato antes do APPLY) ---\n");
  const plan2 = await buildPlan(tenantId);

  if (plan2.sig !== plan1.sig) {
    console.error(
      "ABORTADO: o plano mudou entre os dois dry-runs. Revise os custos no catálogo e rode de novo."
    );
    console.error(`  Assinatura #1: ${plan1.sig}`);
    console.error(`  Assinatura #2: ${plan2.sig}`);
    process.exit(2);
  }

  console.log("Assinaturas coincidem — a aplicar...\n");
  await applyPlan(tenantId, plan1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
