import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type { RegisterHvacIntegrityTestInput } from "@/shared/contracts/hvac-integrity-test.schema";

type Admin = SupabaseClient<Database>;

export type HvacIntegrityTestResult = "pass" | "fail";

export type HvacIntegrityTestRow = {
  id: string;
  order_item_id: string;
  product_id: string | null;
  test_method: string;
  test_date: string;
  result: HvacIntegrityTestResult;
  leakage_rate: number | null;
  notes: string | null;
  tested_by: string | null;
  created_at: string;
};

export type HvacIntegrityTestSummary = {
  required: boolean;
  test_method: string | null;
  latest_result: HvacIntegrityTestResult | null;
  /** Último teste aprovado — libera expedição quando exigido. */
  passed: boolean;
  test_count: number;
  history: HvacIntegrityTestRow[];
};

export type PlanningHvacIntegrityFields = {
  hvac_integrity_required: boolean;
  hvac_integrity_test_method: string | null;
  hvac_integrity_latest_result: HvacIntegrityTestResult | null;
  hvac_integrity_passed: boolean;
  hvac_integrity_test_count: number;
};

export const EMPTY_PLANNING_HVAC_INTEGRITY: PlanningHvacIntegrityFields = {
  hvac_integrity_required: false,
  hvac_integrity_test_method: null,
  hvac_integrity_latest_result: null,
  hvac_integrity_passed: true,
  hvac_integrity_test_count: 0,
};

export function planningFieldsFromIntegritySummary(
  summary: HvacIntegrityTestSummary | undefined
): PlanningHvacIntegrityFields {
  if (!summary) return { ...EMPTY_PLANNING_HVAC_INTEGRITY };
  return {
    hvac_integrity_required: summary.required,
    hvac_integrity_test_method: summary.test_method,
    hvac_integrity_latest_result: summary.latest_result,
    hvac_integrity_passed: summary.passed,
    hvac_integrity_test_count: summary.test_count,
  };
}

function mapTestRow(raw: Record<string, unknown>): HvacIntegrityTestRow {
  return {
    id: String(raw.id),
    order_item_id: String(raw.order_item_id),
    product_id: raw.product_id != null ? String(raw.product_id) : null,
    test_method: String(raw.test_method),
    test_date: String(raw.test_date),
    result: raw.result as HvacIntegrityTestResult,
    leakage_rate:
      raw.leakage_rate != null ? Number(raw.leakage_rate) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    tested_by: raw.tested_by != null ? String(raw.tested_by) : null,
    created_at: String(raw.created_at),
  };
}

function buildSummary(args: {
  required: boolean;
  testMethod: string | null;
  history: HvacIntegrityTestRow[];
}): HvacIntegrityTestSummary {
  const latest = args.history[0] ?? null;
  const passed =
    !args.required || (latest != null && latest.result === "pass");
  return {
    required: args.required,
    test_method: args.testMethod,
    latest_result: latest?.result ?? null,
    passed,
    test_count: args.history.length,
    history: args.history,
  };
}

export async function getOrderItemIntegrityRequirement(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<{ required: boolean; test_method: string | null; product_id: string | null }> {
  const { data, error } = await admin
    .from("order_items")
    .select(
      `
      id,
      product_id,
      product:products (
        hvac_requires_integrity_test,
        hvac_integrity_test_method
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("id", orderItemId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Linha de OP não encontrada.");

  const productRaw = data.product as
    | {
        hvac_requires_integrity_test?: boolean;
        hvac_integrity_test_method?: string | null;
      }
    | {
        hvac_requires_integrity_test?: boolean;
        hvac_integrity_test_method?: string | null;
      }[]
    | null;
  const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;

  return {
    required: product?.hvac_requires_integrity_test === true,
    test_method: product?.hvac_integrity_test_method ?? null,
    product_id: data.product_id,
  };
}

export async function getIntegrityTestSummary(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<HvacIntegrityTestSummary> {
  const req = await getOrderItemIntegrityRequirement(admin, tenantId, orderItemId);

  const { data, error } = await admin
    .from("hvac_integrity_tests")
    .select(
      "id, order_item_id, product_id, test_method, test_date, result, leakage_rate, notes, tested_by, created_at"
    )
    .eq("tenant_id", tenantId)
    .eq("order_item_id", orderItemId)
    .order("test_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const history = (data ?? []).map((row) =>
    mapTestRow(row as Record<string, unknown>)
  );

  return buildSummary({
    required: req.required,
    testMethod: req.test_method,
    history,
  });
}

export async function loadIntegrityTestSummaries(
  admin: Admin,
  tenantId: string,
  orderItemIds: string[]
): Promise<Map<string, HvacIntegrityTestSummary>> {
  const out = new Map<string, HvacIntegrityTestSummary>();
  if (orderItemIds.length === 0) return out;

  const uniqueIds = [...new Set(orderItemIds)];

  const { data: items, error: itemsErr } = await admin
    .from("order_items")
    .select(
      `
      id,
      product:products (
        hvac_requires_integrity_test,
        hvac_integrity_test_method
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);

  if (itemsErr) throw new Error(itemsErr.message);

  const requirementByItem = new Map<
    string,
    { required: boolean; test_method: string | null }
  >();
  for (const row of items ?? []) {
    const productRaw = row.product as
      | {
          hvac_requires_integrity_test?: boolean;
          hvac_integrity_test_method?: string | null;
        }
      | {
          hvac_requires_integrity_test?: boolean;
          hvac_integrity_test_method?: string | null;
        }[]
      | null;
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    requirementByItem.set(String(row.id), {
      required: product?.hvac_requires_integrity_test === true,
      test_method: product?.hvac_integrity_test_method ?? null,
    });
  }

  const { data: tests, error: testsErr } = await admin
    .from("hvac_integrity_tests")
    .select(
      "id, order_item_id, product_id, test_method, test_date, result, leakage_rate, notes, tested_by, created_at"
    )
    .eq("tenant_id", tenantId)
    .in("order_item_id", uniqueIds)
    .order("test_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (testsErr) throw new Error(testsErr.message);

  const historyByItem = new Map<string, HvacIntegrityTestRow[]>();
  for (const raw of tests ?? []) {
    const row = mapTestRow(raw as Record<string, unknown>);
    const list = historyByItem.get(row.order_item_id) ?? [];
    list.push(row);
    historyByItem.set(row.order_item_id, list);
  }

  for (const id of uniqueIds) {
    const req = requirementByItem.get(id) ?? {
      required: false,
      test_method: null,
    };
    out.set(
      id,
      buildSummary({
        required: req.required,
        testMethod: req.test_method,
        history: historyByItem.get(id) ?? [],
      })
    );
  }

  return out;
}

export async function registerIntegrityTest(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    input: RegisterHvacIntegrityTestInput;
  }
): Promise<HvacIntegrityTestRow> {
  const req = await getOrderItemIntegrityRequirement(
    admin,
    args.tenantId,
    args.input.order_item_id
  );

  if (!req.required) {
    throw new Error(
      "Este produto não exige teste de integridade HVAC na ficha técnica."
    );
  }

  const { data, error } = await admin
    .from("hvac_integrity_tests")
    .insert({
      tenant_id: args.tenantId,
      order_item_id: args.input.order_item_id,
      product_id: req.product_id,
      test_method: args.input.test_method,
      test_date: args.input.test_date,
      result: args.input.result,
      leakage_rate: args.input.leakage_rate ?? null,
      notes: args.input.notes?.trim() || null,
      tested_by: args.userId,
    })
    .select(
      "id, order_item_id, product_id, test_method, test_date, result, leakage_rate, notes, tested_by, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Erro ao registar teste de integridade.");
  }

  return mapTestRow(data as Record<string, unknown>);
}

export async function assertSalesOrderReadyForHvacDispatch(
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
  const soItemIds = (soItems ?? []).map((r) => r.id);
  if (soItemIds.length === 0) return;

  const { data: orderItems, error: oiErr } = await admin
    .from("order_items")
    .select(
      `
      id,
      product:products (
        code,
        name,
        hvac_requires_integrity_test
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_item_id", soItemIds);

  if (oiErr) throw new Error(oiErr.message);

  const requiring: { id: string; label: string }[] = [];
  for (const oi of orderItems ?? []) {
    const productRaw = oi.product as
      | {
          code?: string | null;
          name?: string | null;
          hvac_requires_integrity_test?: boolean;
        }
      | {
          code?: string | null;
          name?: string | null;
          hvac_requires_integrity_test?: boolean;
        }[]
      | null;
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    if (product?.hvac_requires_integrity_test !== true) continue;
    const label = [product.code, product.name].filter(Boolean).join(" · ") || oi.id;
    requiring.push({ id: String(oi.id), label });
  }

  if (requiring.length === 0) return;

  const summaries = await loadIntegrityTestSummaries(
    admin,
    tenantId,
    requiring.map((r) => r.id)
  );

  const blocked = requiring.filter((r) => {
    const summary = summaries.get(r.id);
    return !summary?.passed;
  });

  if (blocked.length === 0) return;

  const names = blocked.map((b) => b.label).join("; ");
  throw new Error(
    `Expedição bloqueada: teste de integridade HVAC pendente ou reprovado — ${names}. Registe aprovação (PAO/DOP) no CQ antes de despachar.`
  );
}
