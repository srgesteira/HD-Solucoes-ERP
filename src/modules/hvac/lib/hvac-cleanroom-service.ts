import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import {
  describeCleanroomMismatch,
  isCleanroomClassApplicable,
  lineCanProduceForCleanroom,
} from "@/modules/hvac/lib/hvac-domain";

type Admin = SupabaseClient<Database>;

export type HvacCleanroomSummary = {
  product_cleanroom_class: string | null;
  line_cleanroom_class: string | null;
  line_name: string | null;
  applicable: boolean;
  compatible: boolean;
};

export type PlanningHvacCleanroomFields = {
  hvac_product_cleanroom_class: string | null;
  hvac_line_cleanroom_class: string | null;
  hvac_cleanroom_applicable: boolean;
  hvac_cleanroom_compatible: boolean;
};

export const EMPTY_PLANNING_HVAC_CLEANROOM: PlanningHvacCleanroomFields = {
  hvac_product_cleanroom_class: null,
  hvac_line_cleanroom_class: null,
  hvac_cleanroom_applicable: false,
  hvac_cleanroom_compatible: true,
};

export function planningFieldsFromCleanroomSummary(
  summary: HvacCleanroomSummary | undefined
): PlanningHvacCleanroomFields {
  if (!summary) return { ...EMPTY_PLANNING_HVAC_CLEANROOM };
  return {
    hvac_product_cleanroom_class: summary.product_cleanroom_class,
    hvac_line_cleanroom_class: summary.line_cleanroom_class,
    hvac_cleanroom_applicable: summary.applicable,
    hvac_cleanroom_compatible: summary.compatible,
  };
}

function buildSummary(args: {
  productClass: string | null;
  lineClass: string | null;
  lineName: string | null;
}): HvacCleanroomSummary {
  const applicable = isCleanroomClassApplicable(args.productClass);
  const compatible = lineCanProduceForCleanroom(
    args.lineClass,
    args.productClass
  );
  return {
    product_cleanroom_class: args.productClass,
    line_cleanroom_class: args.lineClass,
    line_name: args.lineName,
    applicable,
    compatible,
  };
}

type ProductCleanroomRow = {
  hvac_cleanroom_class?: string | null;
};

function readProductCleanroom(
  productRaw: ProductCleanroomRow | ProductCleanroomRow[] | null
): string | null {
  const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
  return product?.hvac_cleanroom_class ?? null;
}

export async function loadCleanroomCompatibilitySummaries(
  admin: Admin,
  tenantId: string,
  orderItemIds: string[]
): Promise<Map<string, HvacCleanroomSummary>> {
  const out = new Map<string, HvacCleanroomSummary>();
  if (orderItemIds.length === 0) return out;

  const { data: rows, error } = await admin
    .from("order_items")
    .select(
      `
      id,
      line_id,
      product:products (
        hvac_cleanroom_class
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("id", orderItemIds);

  if (error) throw new Error(error.message);

  const lineIds = [
    ...new Set(
      (rows ?? [])
        .map((row) => row.line_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const lineById = new Map<
    string,
    { hvac_cleanroom_class: string | null; code: string; name: string }
  >();

  if (lineIds.length > 0) {
    const { data: lines, error: lineErr } = await admin
      .from("production_lines")
      .select("id, code, name, hvac_cleanroom_class")
      .eq("tenant_id", tenantId)
      .in("id", lineIds);
    if (lineErr) throw new Error(lineErr.message);
    for (const line of lines ?? []) {
      lineById.set(String(line.id), {
        hvac_cleanroom_class: line.hvac_cleanroom_class ?? null,
        code: line.code,
        name: line.name,
      });
    }
  }

  for (const row of rows ?? []) {
    const productClass = readProductCleanroom(
      row.product as ProductCleanroomRow | ProductCleanroomRow[] | null
    );
    const line = row.line_id ? lineById.get(String(row.line_id)) : undefined;
    const lineName = line ? `${line.code} — ${line.name}` : null;
    out.set(
      String(row.id),
      buildSummary({
        productClass,
        lineClass: line?.hvac_cleanroom_class ?? null,
        lineName,
      })
    );
  }

  return out;
}

export async function assertOrderItemCleanroomCompatible(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<void> {
  const summaries = await loadCleanroomCompatibilitySummaries(
    admin,
    tenantId,
    [orderItemId]
  );
  const summary = summaries.get(orderItemId);
  if (!summary?.applicable || summary.compatible) return;

  throw new Error(
    describeCleanroomMismatch(
      summary.line_cleanroom_class,
      summary.product_cleanroom_class,
      summary.line_name
    )
  );
}

export async function assertSalesOrderReadyForHvacCleanroomDispatch(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<void> {
  const { data: soItems, error: soErr } = await admin
    .from("sales_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId);

  if (soErr) throw new Error(soErr.message);
  const soItemIds = (soItems ?? []).map((row) => String(row.id));
  if (soItemIds.length === 0) return;

  const { data: orderItems, error: oiErr } = await admin
    .from("order_items")
    .select(
      `
      id,
      product:products (
        code,
        name
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_item_id", soItemIds);

  if (oiErr) throw new Error(oiErr.message);

  const orderItemIds = (orderItems ?? []).map((row) => String(row.id));
  if (orderItemIds.length === 0) return;

  const summaries = await loadCleanroomCompatibilitySummaries(
    admin,
    tenantId,
    orderItemIds
  );

  const blocked: string[] = [];
  for (const oi of orderItems ?? []) {
    const summary = summaries.get(String(oi.id));
    if (!summary?.applicable || summary.compatible) continue;
    const productRaw = oi.product as
      | { code?: string | null; name?: string | null }
      | { code?: string | null; name?: string | null }[]
      | null;
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    const label =
      [product?.code, product?.name].filter(Boolean).join(" · ") || oi.id;
    blocked.push(label);
  }

  if (blocked.length === 0) return;

  throw new Error(
    `Expedição bloqueada: área classificada incompatível — ${blocked.join("; ")}. Ajuste a linha de produção ou a ficha HVAC do produto.`
  );
}
