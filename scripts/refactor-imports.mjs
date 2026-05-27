/**
 * Fase 2 — substitui imports @/lib/*, @/components/ui/* pelos novos paths.
 * Uso: node scripts/refactor-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);

/** Ordem: prefixos mais longos primeiro */
const REPLACEMENTS = [
  ["@/lib/supabase/", "@/shared/db/supabase/"],
  ["@/lib/schemas/", "@/shared/contracts/"],
  ["@/lib/permissions", "@/shared/auth/permissions"],
  ["@/lib/numbers/", "@/shared/utils/numbers/"],
  ["@/lib/external/", "@/shared/utils/external/"],
  ["@/lib/sales/", "@/modules/vendas/lib/sales/"],
  ["@/lib/customers/", "@/modules/vendas/lib/customers/"],
  [
    "@/modules/compras/lib/purchasing/inventory-inbound",
    "@/modules/almoxarifado/lib/inventory-inbound",
  ],
  ["@/lib/purchasing/", "@/modules/compras/lib/purchasing/"],
  ["@/lib/suppliers/", "@/modules/compras/lib/suppliers/"],
  ["@/lib/purchasing-requisitions", "@/modules/compras/lib/purchasing-requisitions"],
  ["@/lib/products/", "@/modules/engenharia/lib/products/"],
  ["@/lib/pricing/", "@/modules/engenharia/lib/pricing/"],
  ["@/lib/services/", "@/modules/engenharia/lib/services/"],
  ["@/lib/nfe/", "@/modules/faturamento/lib/nfe/"],
  ["@/lib/production/", "@/modules/producao/lib/production/"],
  ["@/lib/production-line-sync", "@/modules/producao/lib/production-line-sync"],
  ["@/lib/notifications/", "@/modules/boards/lib/notifications/"],
  ["@/lib/pcp-api-auth", "@/modules/pcp/lib/pcp-api-auth"],
  ["@/lib/pcp-item-origin", "@/modules/pcp/lib/pcp-item-origin"],
  ["@/lib/pcp-order-display", "@/modules/pcp/lib/pcp-order-display"],
  ["@/lib/pcp-planning", "@/modules/pcp/lib/pcp-planning"],
  ["@/lib/pcp-purchase-schedule", "@/modules/pcp/lib/pcp-purchase-schedule"],
  ["@/lib/mrp-service", "@/modules/pcp/lib/mrp-service"],
  ["@/lib/order-item-production-status", "@/modules/pcp/lib/order-item-production-status"],
  ["@/lib/labor-allocation-period", "@/modules/rh/lib/labor-allocation-period"],
  ["@/lib/labor-cost-drivers", "@/modules/rh/lib/labor-cost-drivers"],
  ["@/lib/labor-cost-utils", "@/modules/rh/lib/labor-cost-utils"],
  ["@/lib/dashboard/", "@/modules/core/lib/dashboard/"],
  ["@/lib/http", "@/modules/core/lib/http"],
  ["@/lib/types/", "@/modules/core/types/"],
  ["@/lib/validators/work-area", "@/modules/engenharia/lib/validators/work-area"],
  ["@/lib/validators/board", "@/modules/boards/lib/validators/board"],
  ["@/lib/validators/epic", "@/modules/boards/lib/validators/epic"],
  ["@/lib/validators/task", "@/modules/boards/lib/validators/task"],
  ["@/lib/utils/tenant", "@/modules/core/lib/tenant"],
  ["@/lib/utils/module-access", "@/modules/core/lib/module-access"],
  ["@/lib/utils/report-access", "@/modules/core/lib/report-access"],
  ["@/lib/utils/supabase-migration", "@/modules/core/lib/supabase-migration"],
  ["@/lib/utils/work-area", "@/modules/engenharia/lib/work-area"],
  ["@/lib/utils/board-epic", "@/modules/boards/lib/utils/board-epic"],
  ["@/lib/utils/epic-outer-stage", "@/modules/boards/lib/utils/epic-outer-stage"],
  ["@/lib/utils/kanban-helpers", "@/modules/boards/lib/utils/kanban-helpers"],
  ["@/lib/utils/kanban-reorder-permission", "@/modules/boards/lib/utils/kanban-reorder-permission"],
  ["@/lib/utils/task-embed-map", "@/modules/boards/lib/utils/task-embed-map"],
  ["@/lib/utils/task-pipeline", "@/modules/boards/lib/utils/task-pipeline"],
  ["@/lib/utils/task-select", "@/modules/boards/lib/utils/task-select"],
  ["@/lib/utils/task-visibility", "@/modules/boards/lib/utils/task-visibility"],
  ["@/lib/utils/cn", "@/shared/utils/cn"],
  ["@/lib/utils/date", "@/shared/utils/date"],
  ["@/lib/utils/constants", "@/shared/utils/constants"],
  ["@/lib/utils/export-csv", "@/shared/utils/export-csv"],
  ["@/lib/utils/br-document", "@/shared/utils/br-document"],
  ["@/components/ui/", "@/shared/ui/"],
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p, files);
    } else if (EXT.has(path.extname(ent.name))) {
      files.push(p);
    }
  }
  return files;
}

function applyReplacements(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

const files = walk(SRC);
const changed = [];

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = applyReplacements(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed.push(path.relative(ROOT, file));
  }
}

// package.json script path
const pkgPath = path.join(ROOT, "package.json");
const pkg = fs.readFileSync(pkgPath, "utf8");
const pkgNext = pkg.replace(
  "src/lib/types/database.ts",
  "src/modules/core/types/database.ts",
);
if (pkgNext !== pkg) {
  fs.writeFileSync(pkgPath, pkgNext, "utf8");
  changed.push("package.json");
}

console.log(`Arquivos alterados: ${changed.length}`);
for (const f of changed.sort()) {
  console.log(`  ${f}`);
}

// aviso se sobrou @/lib/
const leftovers = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("@/lib/")) leftovers.push(path.relative(ROOT, file));
}
if (leftovers.length) {
  console.log(`\nAVISO: ainda há @/lib/ em ${leftovers.length} arquivo(s):`);
  for (const f of leftovers.slice(0, 30)) console.log(`  ${f}`);
  if (leftovers.length > 30) console.log(`  ... +${leftovers.length - 30}`);
}
