import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import type {
  SaveHvacChecklistInput,
  UpsertHvacChecklistCompletionsInput,
} from "@/shared/contracts/hvac-pop-checklist.schema";
import {
  HVAC_HEPA_POP_CHECKLIST_TEMPLATE,
  isHvacSpecProduct,
} from "@/modules/hvac/lib/hvac-domain";

type Admin = SupabaseClient<Database>;

export type HvacChecklistItemRow = {
  id: string;
  product_id: string;
  sequence: number;
  label: string;
  detail: string | null;
  is_required: boolean;
};

export type HvacChecklistCompletionRow = {
  checklist_item_id: string;
  completed: boolean;
  completed_at: string;
  completed_by: string | null;
  notes: string | null;
};

export type HvacChecklistExecutionSummary = {
  required: boolean;
  total_items: number;
  required_items: number;
  completed_items: number;
  completed_required: number;
  passed: boolean;
  items: Array<
    HvacChecklistItemRow & {
      completion: HvacChecklistCompletionRow | null;
    }
  >;
};

export type PlanningHvacChecklistFields = {
  hvac_checklist_required: boolean;
  hvac_checklist_total: number;
  hvac_checklist_completed: number;
  hvac_checklist_passed: boolean;
};

export const EMPTY_PLANNING_HVAC_CHECKLIST: PlanningHvacChecklistFields = {
  hvac_checklist_required: false,
  hvac_checklist_total: 0,
  hvac_checklist_completed: 0,
  hvac_checklist_passed: true,
};

export function planningFieldsFromChecklistSummary(
  summary: HvacChecklistExecutionSummary | undefined
): PlanningHvacChecklistFields {
  if (!summary) return { ...EMPTY_PLANNING_HVAC_CHECKLIST };
  return {
    hvac_checklist_required: summary.required,
    hvac_checklist_total: summary.total_items,
    hvac_checklist_completed: summary.completed_items,
    hvac_checklist_passed: summary.passed,
  };
}

function mapItemRow(raw: Record<string, unknown>): HvacChecklistItemRow {
  return {
    id: String(raw.id),
    product_id: String(raw.product_id),
    sequence: Number(raw.sequence),
    label: String(raw.label),
    detail: raw.detail != null ? String(raw.detail) : null,
    is_required: raw.is_required === true,
  };
}

function buildExecutionSummary(args: {
  items: HvacChecklistItemRow[];
  completions: Map<string, HvacChecklistCompletionRow>;
}): HvacChecklistExecutionSummary {
  const requiredItems = args.items.filter((i) => i.is_required);
  const enriched = args.items.map((item) => ({
    ...item,
    completion: args.completions.get(item.id) ?? null,
  }));
  const completedItems = enriched.filter((i) => i.completion?.completed === true);
  const completedRequired = completedItems.filter((i) => i.is_required).length;
  const passed =
    requiredItems.length === 0 ||
    completedRequired >= requiredItems.length;

  return {
    required: requiredItems.length > 0,
    total_items: args.items.length,
    required_items: requiredItems.length,
    completed_items: completedItems.length,
    completed_required: completedRequired,
    passed,
    items: enriched,
  };
}

async function assertHvacProduct(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<void> {
  const { data, error } = await admin
    .from("products")
    .select("id, product_nature, prefix:product_prefixes(code)")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Produto não encontrado.");

  const prefixRaw = data.prefix as
    | { code?: string }
    | { code?: string }[]
    | null;
  const prefix = Array.isArray(prefixRaw) ? prefixRaw[0] : prefixRaw;
  if (
    !isHvacSpecProduct({
      product_nature: data.product_nature,
      prefix_code: prefix?.code ?? null,
    })
  ) {
    throw new Error(
      "Checklist POP HEPA aplica-se a produtos acabados (AC / HD1–HD3)."
    );
  }
}

export async function listProductChecklistItems(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<HvacChecklistItemRow[]> {
  const { data, error } = await admin
    .from("product_hvac_checklist_items")
    .select("id, product_id, sequence, label, detail, is_required")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .order("sequence", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapItemRow(row as Record<string, unknown>));
}

export async function saveProductChecklistItems(
  admin: Admin,
  args: {
    tenantId: string;
    productId: string;
    input: SaveHvacChecklistInput;
  }
): Promise<HvacChecklistItemRow[]> {
  await assertHvacProduct(admin, args.tenantId, args.productId);

  const sorted = [...args.input.items].sort((a, b) => a.sequence - b.sequence);

  const { error: delErr } = await admin
    .from("product_hvac_checklist_items")
    .delete()
    .eq("tenant_id", args.tenantId)
    .eq("product_id", args.productId);
  if (delErr) throw new Error(delErr.message);

  const rows = sorted.map((item, idx) => ({
    tenant_id: args.tenantId,
    product_id: args.productId,
    sequence: idx + 1,
    label: item.label.trim(),
    detail: item.detail?.trim() || null,
    is_required: item.is_required ?? true,
  }));

  const { data, error } = await admin
    .from("product_hvac_checklist_items")
    .insert(rows)
    .select("id, product_id, sequence, label, detail, is_required");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapItemRow(row as Record<string, unknown>));
}

export async function seedHepaChecklistTemplate(
  admin: Admin,
  tenantId: string,
  productId: string,
  replace = false
): Promise<HvacChecklistItemRow[]> {
  await assertHvacProduct(admin, tenantId, productId);

  const existing = await listProductChecklistItems(admin, tenantId, productId);
  if (existing.length > 0 && !replace) {
    throw new Error(
      "Este produto já tem checklist. Use substituir para aplicar o template HEPA padrão."
    );
  }

  return saveProductChecklistItems(admin, {
    tenantId,
    productId,
    input: {
      items: HVAC_HEPA_POP_CHECKLIST_TEMPLATE.map((item, idx) => ({
        sequence: idx + 1,
        label: item.label,
        detail: item.detail ?? null,
        is_required: item.is_required ?? true,
      })),
    },
  });
}

async function getOrderItemProductId(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<string> {
  const { data, error } = await admin
    .from("order_items")
    .select("product_id")
    .eq("tenant_id", tenantId)
    .eq("id", orderItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.product_id) throw new Error("Linha de OP sem produto ligado.");
  return data.product_id;
}

export async function getChecklistExecutionSummary(
  admin: Admin,
  tenantId: string,
  orderItemId: string
): Promise<HvacChecklistExecutionSummary> {
  const productId = await getOrderItemProductId(admin, tenantId, orderItemId);
  const items = await listProductChecklistItems(admin, tenantId, productId);

  if (items.length === 0) {
    return buildExecutionSummary({ items: [], completions: new Map() });
  }

  const { data, error } = await admin
    .from("hvac_checklist_completions")
    .select(
      "checklist_item_id, completed, completed_at, completed_by, notes"
    )
    .eq("tenant_id", tenantId)
    .eq("order_item_id", orderItemId);

  if (error) throw new Error(error.message);

  const completions = new Map<string, HvacChecklistCompletionRow>();
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    completions.set(String(row.checklist_item_id), {
      checklist_item_id: String(row.checklist_item_id),
      completed: row.completed === true,
      completed_at: String(row.completed_at),
      completed_by: row.completed_by != null ? String(row.completed_by) : null,
      notes: row.notes != null ? String(row.notes) : null,
    });
  }

  return buildExecutionSummary({ items, completions });
}

export async function loadChecklistExecutionSummaries(
  admin: Admin,
  tenantId: string,
  orderItemIds: string[]
): Promise<Map<string, HvacChecklistExecutionSummary>> {
  const out = new Map<string, HvacChecklistExecutionSummary>();
  if (orderItemIds.length === 0) return out;

  const uniqueIds = [...new Set(orderItemIds)];

  const { data: orderItems, error: oiErr } = await admin
    .from("order_items")
    .select("id, product_id")
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);
  if (oiErr) throw new Error(oiErr.message);

  const productByOrderItem = new Map<string, string>();
  const productIds = new Set<string>();
  for (const row of orderItems ?? []) {
    if (!row.product_id) continue;
    productByOrderItem.set(String(row.id), String(row.product_id));
    productIds.add(String(row.product_id));
  }

  const itemsByProduct = new Map<string, HvacChecklistItemRow[]>();
  if (productIds.size > 0) {
    const { data: items, error: itemsErr } = await admin
      .from("product_hvac_checklist_items")
      .select("id, product_id, sequence, label, detail, is_required")
      .eq("tenant_id", tenantId)
      .in("product_id", [...productIds])
      .order("sequence", { ascending: true });
    if (itemsErr) throw new Error(itemsErr.message);

    for (const raw of items ?? []) {
      const item = mapItemRow(raw as Record<string, unknown>);
      const list = itemsByProduct.get(item.product_id) ?? [];
      list.push(item);
      itemsByProduct.set(item.product_id, list);
    }
  }

  const { data: completionsRaw, error: compErr } = await admin
    .from("hvac_checklist_completions")
    .select(
      "order_item_id, checklist_item_id, completed, completed_at, completed_by, notes"
    )
    .eq("tenant_id", tenantId)
    .in("order_item_id", uniqueIds);
  if (compErr) throw new Error(compErr.message);

  const completionsByOrderItem = new Map<
    string,
    Map<string, HvacChecklistCompletionRow>
  >();
  for (const raw of completionsRaw ?? []) {
    const row = raw as Record<string, unknown>;
    const oiId = String(row.order_item_id);
    const map = completionsByOrderItem.get(oiId) ?? new Map();
    map.set(String(row.checklist_item_id), {
      checklist_item_id: String(row.checklist_item_id),
      completed: row.completed === true,
      completed_at: String(row.completed_at),
      completed_by: row.completed_by != null ? String(row.completed_by) : null,
      notes: row.notes != null ? String(row.notes) : null,
    });
    completionsByOrderItem.set(oiId, map);
  }

  for (const id of uniqueIds) {
    const productId = productByOrderItem.get(id);
    const items = productId ? (itemsByProduct.get(productId) ?? []) : [];
    out.set(
      id,
      buildExecutionSummary({
        items,
        completions: completionsByOrderItem.get(id) ?? new Map(),
      })
    );
  }

  return out;
}

export async function upsertChecklistCompletions(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    input: UpsertHvacChecklistCompletionsInput;
  }
): Promise<HvacChecklistExecutionSummary> {
  const productId = await getOrderItemProductId(
    admin,
    args.tenantId,
    args.input.order_item_id
  );
  const items = await listProductChecklistItems(
    admin,
    args.tenantId,
    productId
  );
  if (items.length === 0) {
    throw new Error("Este produto não tem checklist POP HEPA configurado.");
  }

  const validIds = new Set(items.map((i) => i.id));
  const now = new Date().toISOString();

  for (const entry of args.input.completions) {
    if (!validIds.has(entry.checklist_item_id)) {
      throw new Error("Item de checklist inválido para este produto.");
    }

    if (entry.completed) {
      const { error } = await admin.from("hvac_checklist_completions").upsert(
        {
          tenant_id: args.tenantId,
          order_item_id: args.input.order_item_id,
          checklist_item_id: entry.checklist_item_id,
          product_id: productId,
          completed: true,
          completed_at: now,
          completed_by: args.userId,
          notes: entry.notes?.trim() || null,
        },
        { onConflict: "tenant_id,order_item_id,checklist_item_id" }
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("hvac_checklist_completions")
        .delete()
        .eq("tenant_id", args.tenantId)
        .eq("order_item_id", args.input.order_item_id)
        .eq("checklist_item_id", entry.checklist_item_id);
      if (error) throw new Error(error.message);
    }
  }

  return getChecklistExecutionSummary(
    admin,
    args.tenantId,
    args.input.order_item_id
  );
}

export async function productHasActivePopDocument(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<boolean> {
  const { count, error } = await admin
    .from("product_documents")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("kind", "pop")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function assertSalesOrderReadyForHvacChecklistDispatch(
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
        name
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("sales_order_item_id", soItemIds);
  if (oiErr) throw new Error(oiErr.message);

  const orderItemIds = (orderItems ?? []).map((oi) => String(oi.id));
  if (orderItemIds.length === 0) return;

  const summaries = await loadChecklistExecutionSummaries(
    admin,
    tenantId,
    orderItemIds
  );

  const blocked: string[] = [];
  for (const oi of orderItems ?? []) {
    const summary = summaries.get(String(oi.id));
    if (!summary?.required || summary.passed) continue;
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
    `Expedição bloqueada: checklist POP HEPA incompleto — ${blocked.join("; ")}. Conclua os itens obrigatórios no CQ.`
  );
}
