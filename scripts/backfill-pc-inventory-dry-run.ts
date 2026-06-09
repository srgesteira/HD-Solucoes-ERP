/**
 * DRY-RUN — backfill retroativo de estoque para PCs recebidos.
 * NÃO escreve nada no banco. Remover após ETAPA 2 (APPLY).
 *
 * Uso: npx tsx scripts/backfill-pc-inventory-dry-run.ts
 * Opcional: TENANT_ID=<uuid> para filtrar um tenant.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

type ItemReport = {
  purchase_order_item_id: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  received_quantity: number;
  classification: Classification;
  backfill_qty: number;
  attributed_qty: number;
  attributed_via_poi_ref: number;
  attributed_via_nfe_ref: number;
  nfe_invoice_ids: string[];
  current_on_hand: number;
  projected_on_hand: number;
  detection_notes: string;
};

type PoReport = {
  purchase_order_id: string;
  po_number: string;
  status: string;
  actual_delivery: string | null;
  items: ItemReport[];
};

const env = loadEnv();
const tenantFilter = process.env.TENANT_ID?.trim() || env.TENANT_ID?.trim() || null;

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log("=== BACKFILL PC INVENTORY — DRY-RUN (somente leitura) ===\n");
  console.log("Nenhum dado será escrito.\n");

  if (tenantFilter) {
    console.log(`Filtro tenant: ${tenantFilter}\n`);
  }

  let poQuery = admin
    .from("purchase_orders")
    .select("id, tenant_id, po_number, status, actual_delivery")
    .eq("status", "received")
    .eq("is_suggestion", false)
    .order("actual_delivery", { ascending: true, nullsFirst: false });

  if (tenantFilter) {
    poQuery = poQuery.eq("tenant_id", tenantFilter);
  }

  const { data: pos, error: poErr } = await poQuery;
  if (poErr) throw new Error(poErr.message);

  const orders = pos ?? [];
  if (!orders.length) {
    console.log("Nenhum PC com status received encontrado.");
    return;
  }

  const poIds = orders.map((o) => o.id);
  const tenantIds = [...new Set(orders.map((o) => o.tenant_id))];

  const { data: poiRows, error: poiErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, tenant_id, purchase_order_id, product_id, received_quantity, description"
    )
    .in("purchase_order_id", poIds)
    .gt("received_quantity", 0);

  if (poiErr) throw new Error(poiErr.message);

  const items = (poiRows ?? []).filter((r) => r.product_id);
  const poiIds = items.map((i) => i.id);
  const productIds = [...new Set(items.map((i) => i.product_id!).filter(Boolean))];

  const { data: products } = await admin
    .from("products")
    .select("id, technical_code, name")
    .in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);

  const productById = new Map(
    (products ?? []).map((p) => [p.id, p])
  );

  const { data: invRows } = await admin
    .from("inventory")
    .select("tenant_id, product_id, quantity_on_hand")
    .in("tenant_id", tenantIds)
    .in(
      "product_id",
      productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const onHandKey = (tenantId: string, productId: string) =>
    `${tenantId}:${productId}`;
  const onHandByKey = new Map<string, number>();
  for (const r of invRows ?? []) {
    onHandByKey.set(
      onHandKey(r.tenant_id, r.product_id),
      Number(r.quantity_on_hand ?? 0)
    );
  }

  const { data: siiRows } = await admin
    .from("supplier_invoice_items")
    .select("purchase_order_item_id, supplier_invoice_id, product_id, quantity")
    .in(
      "purchase_order_item_id",
      poiIds.length ? poiIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const nfeIdsByPoi = new Map<string, Set<string>>();
  for (const row of siiRows ?? []) {
    if (!row.purchase_order_item_id || !row.supplier_invoice_id) continue;
    const set = nfeIdsByPoi.get(row.purchase_order_item_id) ?? new Set();
    set.add(row.supplier_invoice_id);
    nfeIdsByPoi.set(row.purchase_order_item_id, set);
  }

  const allRefIds = [
    ...poiIds,
    ...[...nfeIdsByPoi.values()].flatMap((s) => [...s]),
  ];

  const { data: movRows } = await admin
    .from("inventory_movements")
    .select("tenant_id, product_id, movement_type, quantity, reference_id, reason")
    .in("tenant_id", tenantIds)
    .eq("movement_type", "in")
    .in(
      "product_id",
      productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const movements = movRows ?? [];

  function attributedForPoi(
    tenantId: string,
    poiId: string,
    productId: string
  ): { viaPoi: number; viaNfe: number; nfeIds: string[] } {
    let viaPoi = 0;
    let viaNfe = 0;
    const nfeIds = [...(nfeIdsByPoi.get(poiId) ?? [])];

    for (const m of movements) {
      if (m.tenant_id !== tenantId || m.product_id !== productId) continue;
      const qty = Number(m.quantity ?? 0);
      if (m.reference_id === poiId) {
        viaPoi += qty;
      } else if (m.reference_id && nfeIds.includes(m.reference_id)) {
        viaNfe += qty;
      }
    }

    return { viaPoi: round4(viaPoi), viaNfe: round4(viaNfe), nfeIds };
  }

  function classifyItem(
    received: number,
    viaPoi: number,
    viaNfe: number
  ): { classification: Classification; backfill_qty: number; notes: string } {
    const attributed = round4(viaPoi + viaNfe);
    const remaining = round4(received - attributed);

    if (attributed >= received - 0.0001) {
      return {
        classification: "JÁ TEM ENTRADA",
        backfill_qty: 0,
        notes:
          viaPoi > 0 && viaNfe > 0
            ? `Movimentos in: ${viaPoi} via POI ref + ${viaNfe} via NF-e ref (>= received)`
            : viaPoi > 0
              ? `Movimento in com reference_id = purchase_order_item_id (${viaPoi})`
              : `Movimento in com reference_id = supplier_invoice_id (${viaNfe})`,
      };
    }

    if (attributed <= 0.0001) {
      return {
        classification: "SEM ENTRADA",
        backfill_qty: received,
        notes: "Nenhum inventory_movements in com reference_id POI ou NF-e ligada",
      };
    }

    return {
      classification: "INCERTO",
      backfill_qty: remaining,
      notes: `Entrada parcial atribuída (${attributed} de ${received}): POI ref=${viaPoi}, NF-e ref=${viaNfe}. Revisar antes de aplicar.`,
    };
  }

  const poById = new Map(orders.map((o) => [o.id, o]));
  const itemsByPo = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByPo.get(item.purchase_order_id!) ?? [];
    list.push(item);
    itemsByPo.set(item.purchase_order_id!, list);
  }

  const reports: PoReport[] = [];

  for (const po of orders) {
    const poItems = itemsByPo.get(po.id) ?? [];
    const itemReports: ItemReport[] = [];

    for (const item of poItems) {
      const productId = item.product_id!;
      const received = round4(Number(item.received_quantity ?? 0));
      const { viaPoi, viaNfe, nfeIds } = attributedForPoi(
        po.tenant_id,
        item.id,
        productId
      );
      const { classification, backfill_qty, notes } = classifyItem(
        received,
        viaPoi,
        viaNfe
      );
      const prod = productById.get(productId);
      const current = round4(
        onHandByKey.get(onHandKey(po.tenant_id, productId)) ?? 0
      );
      const projected =
        classification === "SEM ENTRADA"
          ? round4(current + backfill_qty)
          : classification === "INCERTO"
            ? round4(current + backfill_qty)
            : current;

      itemReports.push({
        purchase_order_item_id: item.id,
        product_id: productId,
        product_code: prod?.technical_code ?? null,
        product_name: prod?.name ?? item.description,
        received_quantity: received,
        classification,
        backfill_qty,
        attributed_qty: round4(viaPoi + viaNfe),
        attributed_via_poi_ref: viaPoi,
        attributed_via_nfe_ref: viaNfe,
        nfe_invoice_ids: nfeIds,
        current_on_hand: current,
        projected_on_hand: projected,
        detection_notes: notes,
      });
    }

    if (itemReports.length) {
      reports.push({
        purchase_order_id: po.id,
        po_number: po.po_number,
        status: po.status,
        actual_delivery: po.actual_delivery,
        items: itemReports,
      });
    }
  }

  const totals = {
    purchase_orders: reports.length,
    items: reports.reduce((s, p) => s + p.items.length, 0),
    sem_entrada: 0,
    ja_tem_entrada: 0,
    incerto: 0,
    backfill_qty_total: 0,
  };

  for (const po of reports) {
    for (const it of po.items) {
      if (it.classification === "SEM ENTRADA") totals.sem_entrada += 1;
      if (it.classification === "JÁ TEM ENTRADA") totals.ja_tem_entrada += 1;
      if (it.classification === "INCERTO") totals.incerto += 1;
      if (it.classification !== "JÁ TEM ENTRADA") {
        totals.backfill_qty_total += it.backfill_qty;
      }
    }
  }

  console.log("--- CRITÉRIO DE DETECÇÃO (conservador) ---");
  console.log(
    "1) JÁ TEM ENTRADA: soma de inventory_movements (movement_type=in) do mesmo tenant+produto onde:"
  );
  console.log(
    "   a) reference_id = purchase_order_item.id (entrada do passo 1 Receber PC), OU"
  );
  console.log(
    "   b) reference_id = supplier_invoice_id ligado via supplier_invoice_items.purchase_order_item_id"
  );
  console.log(
    "   Se attributed_qty >= received_quantity → pulado (não entra no backfill)."
  );
  console.log(
    "2) SEM ENTRADA: attributed_qty = 0 → backfill = received_quantity inteiro."
  );
  console.log(
    "3) INCERTO: 0 < attributed_qty < received_quantity (parcial) → revisar manual."
  );
  console.log(
    "NOTA: ajuste manual em /inventory NÃO gera movement — não detectável; risco se alguém ajustou sem movimento.\n"
  );

  console.log("--- RELATÓRIO POR PC ---\n");
  console.log(
    [
      "PC",
      "Produto",
      "received_qty",
      "Já tem entrada?",
      "Entraria (qtd)",
      "Saldo atual",
      "Saldo após*",
    ].join("\t")
  );

  for (const po of reports) {
    for (const it of po.items) {
      console.log(
        [
          po.po_number,
          `${it.product_code ?? "?"} — ${(it.product_name ?? "").slice(0, 40)}`,
          it.received_quantity,
          it.classification,
          it.classification === "JÁ TEM ENTRADA" ? 0 : it.backfill_qty,
          it.current_on_hand,
          it.classification === "JÁ TEM ENTRADA" ? "—" : it.projected_on_hand,
        ].join("\t")
      );
    }
  }

  console.log("\n--- DETALHE INCERTO / JÁ TEM ENTRADA (notas) ---\n");
  for (const po of reports) {
    for (const it of po.items) {
      if (it.classification === "SEM ENTRADA") continue;
      console.log(
        `${po.po_number} | ${it.product_code} | ${it.classification} | ${it.detection_notes}`
      );
    }
  }

  const negativeProjections = new Map<
    string,
    { code: string; current: number; delta: number; projected: number }
  >();

  for (const po of reports) {
    for (const it of po.items) {
      if (it.classification === "JÁ TEM ENTRADA") continue;
      const key = it.product_id;
      const prev = negativeProjections.get(key);
      const delta = (prev?.delta ?? 0) + it.backfill_qty;
      const current = it.current_on_hand;
      negativeProjections.set(key, {
        code: it.product_code ?? key.slice(0, 8),
        current,
        delta,
        projected: round4(current + delta),
      });
    }
  }

  console.log("\n--- PRODUTOS COM SALDO NEGATIVO HOJE (projeção após backfill SEM ENTRADA + INCERTO) ---\n");
  const negativeToday = [...negativeProjections.values()].filter(
    (v) => v.current < -0.0001 || v.projected < -0.0001
  );
  if (!negativeToday.length) {
    console.log("(nenhum produto afetado com saldo negativo na projeção)");
  } else {
    console.log("Produto\tSaldo atual\t+Backfill\tSaldo projetado");
    for (const v of negativeToday.sort((a, b) => a.projected - b.projected)) {
      console.log(`${v.code}\t${v.current}\t+${v.delta}\t${v.projected}`);
    }
  }

  console.log("\n--- TOTAIS ---");
  console.log(JSON.stringify(totals, null, 2));

  console.log("\n=== FIM DRY-RUN — zero escritas no banco ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
