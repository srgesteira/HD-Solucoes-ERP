/**
 * APPLY — backfill retroativo (ETAPA 2). Escreve no banco.
 * Só os 5 itens SEM ENTRADA validados no dry-run, com re-checagem antes de cada um.
 *
 * Uso: npx tsx scripts/backfill-pc-inventory-apply.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyInventoryInbound } from "../src/modules/almoxarifado/lib/inventory-inbound";

function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf-8").split(
    /\r?\n/
  )) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

type Classification = "SEM ENTRADA" | "JÁ TEM ENTRADA" | "INCERTO";

/** Escopo fechado — dry-run validado pelo usuário. */
const ALLOWED_ITEMS: Array<{ po_number: string; product_code: string }> = [
  { po_number: "PV-2026-0001-AGR-C8R7", product_code: "MP-A10-001" },
  { po_number: "PV-2026-0001-AGR-C8R7", product_code: "MP-A10-002" },
  { po_number: "PV-2026-0001-AGR-C8R7", product_code: "MP-A00-001" },
  { po_number: "PV-2026-0002-1-MO-A11-003", product_code: "MO-A11-003" },
  { po_number: "PV-2026-0001-rev01-1-MO-A11-001", product_code: "MO-A11-001" },
];

const env = loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getOnHand(
  tenantId: string,
  productId: string
): Promise<number> {
  const { data } = await admin
    .from("inventory")
    .select("quantity_on_hand")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();
  return round4(Number(data?.quantity_on_hand ?? 0));
}

async function classifyPoi(
  tenantId: string,
  poiId: string,
  productId: string,
  received: number
): Promise<{
  classification: Classification;
  attributed: number;
  viaPoi: number;
  viaNfe: number;
}> {
  const { data: siiRows } = await admin
    .from("supplier_invoice_items")
    .select("supplier_invoice_id")
    .eq("purchase_order_item_id", poiId);

  const nfeIds = [
    ...new Set(
      (siiRows ?? [])
        .map((r) => r.supplier_invoice_id)
        .filter(Boolean) as string[]
    ),
  ];

  const { data: movRows } = await admin
    .from("inventory_movements")
    .select("quantity, reference_id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("movement_type", "in");

  let viaPoi = 0;
  let viaNfe = 0;
  for (const m of movRows ?? []) {
    const qty = Number(m.quantity ?? 0);
    if (m.reference_id === poiId) viaPoi += qty;
    else if (m.reference_id && nfeIds.includes(m.reference_id)) viaNfe += qty;
  }

  viaPoi = round4(viaPoi);
  viaNfe = round4(viaNfe);
  const attributed = round4(viaPoi + viaNfe);

  if (attributed >= received - 0.0001) {
    return { classification: "JÁ TEM ENTRADA", attributed, viaPoi, viaNfe };
  }
  if (attributed <= 0.0001) {
    return { classification: "SEM ENTRADA", attributed, viaPoi, viaNfe };
  }
  return { classification: "INCERTO", attributed, viaPoi, viaNfe };
}

type AppliedRow = {
  po_number: string;
  product_code: string;
  purchase_order_item_id: string;
  product_id: string;
  quantity: number;
  saldo_antes: number;
  saldo_depois: number;
  movement_id: string;
};

async function main() {
  console.log("=== BACKFILL PC INVENTORY — APPLY ===\n");

  const applied: AppliedRow[] = [];
  const skipped: Array<{ po_number: string; product_code: string; reason: string }> =
    [];

  for (const spec of ALLOWED_ITEMS) {
    const { data: po } = await admin
      .from("purchase_orders")
      .select("id, tenant_id, po_number, status")
      .eq("po_number", spec.po_number)
      .eq("is_suggestion", false)
      .maybeSingle();

    if (!po) {
      console.error(`ABORT: PC não encontrado: ${spec.po_number}`);
      console.log("Já aplicados:", JSON.stringify(applied, null, 2));
      process.exit(1);
    }

    const { data: product } = await admin
      .from("products")
      .select("id, technical_code, name")
      .eq("tenant_id", po.tenant_id)
      .eq("technical_code", spec.product_code)
      .maybeSingle();

    if (!product) {
      console.error(`ABORT: Produto não encontrado: ${spec.product_code}`);
      console.log("Já aplicados:", JSON.stringify(applied, null, 2));
      process.exit(1);
    }

    const { data: poi } = await admin
      .from("purchase_order_items")
      .select("id, received_quantity, product_id")
      .eq("purchase_order_id", po.id)
      .eq("tenant_id", po.tenant_id)
      .eq("product_id", product.id)
      .maybeSingle();

    if (!poi) {
      console.error(
        `ABORT: Item não encontrado: ${spec.po_number} / ${spec.product_code}`
      );
      console.log("Já aplicados:", JSON.stringify(applied, null, 2));
      process.exit(1);
    }

    const received = round4(Number(poi.received_quantity ?? 0));
    if (received <= 0) {
      console.error(`ABORT: received_quantity <= 0 para ${spec.product_code}`);
      console.log("Já aplicados:", JSON.stringify(applied, null, 2));
      process.exit(1);
    }

    const check = await classifyPoi(
      po.tenant_id,
      poi.id,
      product.id,
      received
    );

    if (check.classification !== "SEM ENTRADA") {
      skipped.push({
        po_number: spec.po_number,
        product_code: spec.product_code,
        reason: `${check.classification} (attributed=${check.attributed}, poi_ref=${check.viaPoi}, nfe_ref=${check.viaNfe})`,
      });
      console.log(
        `SKIP ${spec.po_number} | ${spec.product_code} → ${check.classification}`
      );
      continue;
    }

    const saldoAntes = await getOnHand(po.tenant_id, product.id);

    const invRes = await applyInventoryInbound(
      admin,
      po.tenant_id,
      product.id,
      received,
      {
        reason: `Backfill PC recebido (${po.po_number})`,
        referenceId: poi.id,
      }
    );

    if (invRes.error) {
      console.error(`ABORT em ${spec.po_number} / ${spec.product_code}:`, invRes.error);
      console.log("Já aplicados:", JSON.stringify(applied, null, 2));
      process.exit(1);
    }

    const saldoDepois = await getOnHand(po.tenant_id, product.id);

    const { data: mov } = await admin
      .from("inventory_movements")
      .select("id, quantity, reference_id, reason, created_at")
      .eq("tenant_id", po.tenant_id)
      .eq("product_id", product.id)
      .eq("reference_id", poi.id)
      .eq("movement_type", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!mov?.id) {
      console.error(`ABORT: movimento não encontrado após entrada ${poi.id}`);
      console.log("Já aplicados:", JSON.stringify(applied, null, 2));
      process.exit(1);
    }

    const row: AppliedRow = {
      po_number: po.po_number,
      product_code: spec.product_code,
      purchase_order_item_id: poi.id,
      product_id: product.id,
      quantity: received,
      saldo_antes: saldoAntes,
      saldo_depois: saldoDepois,
      movement_id: mov.id,
    };
    applied.push(row);

    console.log(
      `OK ${po.po_number} | ${spec.product_code} | qtd=${received} | saldo ${saldoAntes} → ${saldoDepois} | mov=${mov.id}`
    );
  }

  console.log("\n--- PULADOS ---");
  console.log(skipped.length ? JSON.stringify(skipped, null, 2) : "(nenhum)");

  console.log("\n--- ESTADO FINAL POR PRODUTO ---");
  const productCodes = [...new Set(applied.map((a) => a.product_code))];
  const expected: Record<string, number> = {
    "MP-A10-001": 114.09,
    "MP-A10-002": 77.539,
    "MP-A00-001": 8,
    "MO-A11-003": 0,
    "MO-A11-001": -6,
  };

  for (const code of productCodes) {
    const row = applied.find((a) => a.product_code === code)!;
    const actual = row.saldo_depois;
    const exp = expected[code];
    const match =
      exp !== undefined && Math.abs(actual - exp) < 0.01 ? "✅" : "⚠️";
    console.log(
      `${code}: antes=${row.saldo_antes} depois=${actual} esperado=${exp ?? "?"} ${match}`
    );
  }

  console.log("\n--- INVENTORY_MOVEMENTS CRIADOS ---");
  for (const a of applied) {
    console.log(
      JSON.stringify({
        id: a.movement_id,
        product_code: a.product_code,
        quantity: a.quantity,
        reference_id: a.purchase_order_item_id,
      })
    );
  }

  console.log("\n--- RESUMO ---");
  console.log(
    JSON.stringify(
      {
        applied_count: applied.length,
        skipped_count: skipped.length,
        total_qty: round4(applied.reduce((s, r) => s + r.quantity, 0)),
      },
      null,
      2
    )
  );

  console.log("\n=== FIM APPLY ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
