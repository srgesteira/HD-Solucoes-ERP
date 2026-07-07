/**
 * Diagnóstico: descasamento payment_installments vs AP count.
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
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== Query 1: PV-2026-0002-1-MO-A11-003 ===\n");
  const { data: pos } = await admin
    .from("purchase_orders")
    .select("id, po_number, payment_installments, status, total")
    .ilike("po_number", "%PV-2026-0002-1-MO-A11-003%");

  for (const po of pos ?? []) {
    const { data: aps } = await admin
      .from("accounts_payable")
      .select("id, installment_index, original_amount, status, amount_locked, is_forecast, description")
      .eq("purchase_order_id", po.id)
      .order("installment_index");
    const sum = (aps ?? []).reduce((s, a) => s + Number(a.original_amount), 0);
    console.log({
      po_number: po.po_number,
      payment_installments: po.payment_installments,
      status: po.status,
      total_pc: po.total,
      qtd_parcelas: aps?.length ?? 0,
      soma_ap: Number(sum.toFixed(2)),
    });
    if (aps?.length) {
      console.log("  amostra:", aps[0].description, "|", aps[aps.length - 1].description);
      console.log("  statuses:", [...new Set(aps.map((a) => a.status))].join(", "));
      console.log("  is_forecast:", [...new Set(aps.map((a) => a.is_forecast))].join(", "));
    }
  }

  console.log("\n=== Query 4: todos os descasamentos ===\n");
  const { data: allPos } = await admin
    .from("purchase_orders")
    .select("id, po_number, payment_installments, status")
    .eq("is_suggestion", false);

  const mismatches = [];
  for (const po of allPos ?? []) {
    const { count } = await admin
      .from("accounts_payable")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", po.id);
    if ((count ?? 0) > 0 && po.payment_installments !== count) {
      mismatches.push({
        po_number: po.po_number,
        status: po.status,
        parcelas_pedido: po.payment_installments,
        parcelas_ap: count,
      });
    }
  }
  mismatches.sort((a, b) =>
    String(a.po_number).localeCompare(String(b.po_number), "pt-BR", { numeric: true })
  );
  console.log("Total descasados:", mismatches.length);
  for (const m of mismatches) console.log(m);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
