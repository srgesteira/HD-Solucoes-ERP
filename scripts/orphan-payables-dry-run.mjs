/**
 * Dry-run: PCs received sem nenhuma linha em accounts_payable.
 *
 * Uso: node scripts/orphan-payables-dry-run.mjs
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

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: received, error } = await admin
    .from("purchase_orders")
    .select("id, po_number, status, total, created_at, tenant_id")
    .eq("status", "received")
    .eq("is_suggestion", false);

  if (error) {
    console.error("Erro:", error.message);
    process.exit(1);
  }

  const orphans = [];
  for (const po of received ?? []) {
    const { count } = await admin
      .from("accounts_payable")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", po.id);
    if ((count ?? 0) === 0) orphans.push(po);
  }

  orphans.sort((a, b) =>
    String(a.po_number).localeCompare(String(b.po_number), "pt-BR", {
      numeric: true,
    })
  );

  const total = orphans.reduce((s, p) => s + Number(p.total || 0), 0);

  console.log("=== PCs received SEM accounts_payable (dry-run) ===\n");
  console.log("Quantidade:", orphans.length);
  console.log(
    "Valor total:",
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(total)
  );
  console.log("");
  for (const p of orphans) {
    console.log(
      `  ${p.po_number}\tR$ ${Number(p.total).toFixed(2)}\t${p.created_at?.slice(0, 10) ?? "?"}\t${p.id}`
    );
  }
  if (orphans.length === 0) console.log("  (nenhum)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
