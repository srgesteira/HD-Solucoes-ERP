import type { AdminClient } from "@/modules/vendas/lib/sales/sales-flow";
import type { SalesOrderUpdate } from "@/modules/core/types/sales.types";

export type SalesOrderLogInsert = {
  tenant_id: string;
  sales_order_id: string;
  changed_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  notes?: string | null;
};

/** Campos editáveis com produção já iniciada (apenas administrativos). */
export const SALES_ORDER_ADMIN_FIELDS_WHEN_PRODUCTION = new Set([
  "notes",
  "expected_delivery",
  "payment_installments",
  "payment_days_to_first_due",
  "payment_days_between_installments",
]);

/** Rótulos em português para exibição no histórico. */
export const SALES_ORDER_FIELD_LABELS: Record<string, string> = {
  client_name: "Cliente (nome)",
  client_document: "Cliente (documento)",
  client_email: "Cliente (e-mail)",
  client_phone: "Cliente (telefone)",
  client_address: "Cliente (endereço)",
  expected_delivery: "Prazo de entrega",
  notes: "Observações",
  payment_installments: "Parcelas",
  payment_days_to_first_due: "Dias até 1.ª parcela",
  payment_days_between_installments: "Dias entre parcelas",
  order_date: "Data do pedido",
  order_number: "Número do pedido",
  status: "Estado",
  pcp_deadline: "Prazo PCP",
  actual_delivery: "Entrega efectiva",
  discount: "Desconto",
  tax: "Impostos",
  subtotal: "Subtotal",
  total: "Total",
  items: "Itens do pedido",
};

const LOGGED_SCALAR_FIELDS = [
  "client_name",
  "client_document",
  "client_email",
  "client_phone",
  "client_address",
  "expected_delivery",
  "notes",
  "payment_installments",
  "payment_days_to_first_due",
  "payment_days_between_installments",
  "order_date",
  "order_number",
  "status",
  "pcp_deadline",
  "actual_delivery",
  "discount",
  "tax",
  "subtotal",
  "total",
] as const;

export type SalesOrderItemSnapshot = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit: string;
};

export function serializeLogValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function valuesEqualForLog(a: unknown, b: unknown): boolean {
  return serializeLogValue(a) === serializeLogValue(b);
}

export function serializeOrderItemsForLog(
  items: SalesOrderItemSnapshot[]
): string {
  const rows = items.map((it) => ({
    product_id: it.product_id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    unit: it.unit,
  }));
  return JSON.stringify(rows);
}

export function buildScalarChangeLogs(
  existing: Record<string, unknown>,
  updateData: SalesOrderUpdate
): SalesOrderLogInsert[] {
  const logs: SalesOrderLogInsert[] = [];

  for (const field of LOGGED_SCALAR_FIELDS) {
    if (!(field in updateData)) continue;
    const oldVal = existing[field];
    const newVal = updateData[field as keyof SalesOrderUpdate];
    if (valuesEqualForLog(oldVal, newVal)) continue;
    logs.push({
      tenant_id: "",
      sales_order_id: "",
      changed_by: null,
      field_name: field,
      old_value: serializeLogValue(oldVal),
      new_value: serializeLogValue(newVal),
    });
  }

  return logs;
}

export function buildItemsChangeLog(
  oldItems: SalesOrderItemSnapshot[],
  newItems: SalesOrderItemSnapshot[]
): { old_value: string; new_value: string } | null {
  const oldSer = serializeOrderItemsForLog(oldItems);
  const newSer = serializeOrderItemsForLog(newItems);
  if (oldSer === newSer) return null;
  return { old_value: oldSer, new_value: newSer };
}

function itemLineKey(it: SalesOrderItemSnapshot): string {
  return `${it.product_id ?? ""}|${it.description.trim().toLowerCase()}`;
}

/** Registos legíveis por alteração de item (quantidade, preço, adição/remoção). */
export function buildItemChangeLogEntries(
  oldItems: SalesOrderItemSnapshot[],
  newItems: SalesOrderItemSnapshot[]
): Array<{
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
}> {
  const entries: Array<{
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    notes: string | null;
  }> = [];

  const oldMap = new Map<string, SalesOrderItemSnapshot>();
  for (const it of oldItems) oldMap.set(itemLineKey(it), it);

  const newMap = new Map<string, SalesOrderItemSnapshot>();
  for (const it of newItems) newMap.set(itemLineKey(it), it);

  for (const [key, oldIt] of oldMap) {
    const newIt = newMap.get(key);
    const label = oldIt.description.trim() || "Item";
    if (!newIt) {
      entries.push({
        field_name: "items",
        old_value: `${oldIt.quantity} × ${oldIt.unit_price}`,
        new_value: null,
        notes: `Removido: ${label}`,
      });
      continue;
    }
    if (oldIt.quantity !== newIt.quantity) {
      entries.push({
        field_name: "items",
        old_value: String(oldIt.quantity),
        new_value: String(newIt.quantity),
        notes: `${label}: quantidade alterada`,
      });
    }
    if (oldIt.unit_price !== newIt.unit_price) {
      entries.push({
        field_name: "items",
        old_value: String(oldIt.unit_price),
        new_value: String(newIt.unit_price),
        notes: `${label}: preço unitário alterado`,
      });
    }
  }

  for (const [key, newIt] of newMap) {
    if (oldMap.has(key)) continue;
    const label = newIt.description.trim() || "Item";
    entries.push({
      field_name: "items",
      old_value: null,
      new_value: `${newIt.quantity} × ${newIt.unit_price}`,
      notes: `Adicionado: ${label}`,
    });
  }

  if (!entries.length) {
    const bulk = buildItemsChangeLog(oldItems, newItems);
    if (bulk) {
      entries.push({
        field_name: "items",
        old_value: bulk.old_value,
        new_value: bulk.new_value,
        notes: "Itens do pedido actualizados",
      });
    }
  }

  return entries;
}

export function getRestrictedFieldsWhenProductionStarted(
  updateData: SalesOrderUpdate,
  options: { itemsReplaced: boolean; customerResolved: boolean }
): string[] {
  const blocked: string[] = [];
  const admin = SALES_ORDER_ADMIN_FIELDS_WHEN_PRODUCTION;

  for (const key of Object.keys(updateData)) {
    if (key === "status") continue;
    if (!admin.has(key)) {
      blocked.push(key);
    }
  }
  if (options.customerResolved) {
    blocked.push(
      "client_name",
      "client_document",
      "client_email",
      "client_phone",
      "client_address"
    );
  }
  if (options.itemsReplaced) blocked.push("items");
  return [...new Set(blocked)];
}

export function isSalesOrderLogsTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("sales_order_logs") &&
    (m.includes("schema cache") ||
      m.includes("does not exist") ||
      m.includes("pgrst205") ||
      m.includes("could not find the table"))
  );
}

export async function insertSalesOrderLogs(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  changedBy: string | null,
  entries: Omit<SalesOrderLogInsert, "tenant_id" | "sales_order_id" | "changed_by">[]
): Promise<{ error?: string }> {
  if (!entries.length) return {};

  const rows = entries.map((e) => ({
    tenant_id: tenantId,
    sales_order_id: salesOrderId,
    changed_by: changedBy,
    field_name: e.field_name,
    old_value: e.old_value,
    new_value: e.new_value,
    notes: e.notes ?? null,
  }));

  const { error } = await admin.from("sales_order_logs").insert(rows);
  if (error) return { error: error.message };
  return {};
}

/** Grava histórico sem falhar a operação principal (ex.: tabela ainda não migrada). */
export async function insertSalesOrderLogsBestEffort(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string,
  changedBy: string | null,
  entries: Omit<SalesOrderLogInsert, "tenant_id" | "sales_order_id" | "changed_by">[]
): Promise<void> {
  if (!entries.length) return;

  try {
    const result = await insertSalesOrderLogs(
      admin,
      tenantId,
      salesOrderId,
      changedBy,
      entries
    );
    if (result.error) {
      if (isSalesOrderLogsTableMissingError(result.error)) {
        console.warn(
          "[sales_order_logs] Tabela ausente no Supabase; pedido actualizado sem histórico.",
          result.error
        );
      } else {
        console.warn(
          "[sales_order_logs] Falha ao registar histórico:",
          result.error
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isSalesOrderLogsTableMissingError(message)) {
      console.warn(
        "[sales_order_logs] Tabela ausente no Supabase; pedido actualizado sem histórico.",
        message
      );
    } else {
      console.warn("[sales_order_logs] Erro inesperado ao registar histórico:", message);
    }
  }
}

export async function fetchSalesOrderItemsSnapshot(
  admin: AdminClient,
  tenantId: string,
  salesOrderId: string
): Promise<SalesOrderItemSnapshot[]> {
  const { data, error } = await admin
    .from("sales_order_items")
    .select("product_id, description, quantity, unit_price, unit")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", salesOrderId)
    .order("line_number", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    product_id: typeof r.product_id === "string" ? r.product_id : null,
    description: String(r.description ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit_price: Number(r.unit_price ?? 0),
    unit: String(r.unit ?? "UN"),
  }));
}
