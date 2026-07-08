import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { parseUfFromAddress } from "@/modules/fiscal/lib/fiscal-rules-service";
import {
  FISCAL_STATUS_LABELS,
  isFiscalConfigured,
  type FiscalStatus,
} from "@/modules/fiscal/lib/fiscal-rules-types";

type Admin = SupabaseClient<Database>;

export type FiscalOrderReviewItem = {
  id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  product_id: string | null;
  product_name: string | null;
  ncm: string | null;
  product_nature: string | null;
  icms_rate: number | null;
  icms_value: number | null;
  ipi_rate: number | null;
  ipi_value: number | null;
  tax_base: number | null;
};

export type FiscalOrderReview = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  client_name: string;
  client_document: string | null;
  client_address: string | null;
  destination_uf: string | null;
  total: number;
  total_icms: number;
  total_ipi: number;
  total_tax_base: number;
  fiscal_status: string;
  fiscal_status_label: string;
  fiscal_configured: boolean;
  ready_for_invoice: boolean;
  billing_plan: string | null;
  billing_closure: string | null;
  notes: string | null;
  items: FiscalOrderReviewItem[];
  warnings: string[];
};

type RawOrderRow = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  client_name: string;
  client_document: string | null;
  client_address: string | null;
  total: number | null;
  total_icms: number | null;
  total_ipi: number | null;
  total_tax_base: number | null;
  fiscal_status: string | null;
  ready_for_invoice: boolean | null;
  billing_plan: string | null;
  billing_closure: string | null;
  notes: string | null;
  items?: unknown;
};

export async function getFiscalOrderReview(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<FiscalOrderReview | null> {
  const db = asUntypedAdmin(admin);

  // billing_plan / billing_closure: pós-migração — tipos em database.ts ainda sem estas colunas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("sales_orders") as any)
    .select(
      `
      id,
      order_number,
      status,
      order_date,
      client_name,
      client_document,
      client_address,
      total,
      total_icms,
      total_ipi,
      total_tax_base,
      fiscal_status,
      ready_for_invoice,
      billing_plan,
      billing_closure,
      notes,
      items:sales_order_items(
        id,
        line_number,
        description,
        quantity,
        unit,
        unit_price,
        total_price,
        product_id,
        icms_rate,
        icms_value,
        ipi_rate,
        ipi_value,
        tax_base,
        product:products!sales_order_items_product_id_fkey(name, ncm, product_nature)
      )
    `
    )
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const order = data as RawOrderRow;
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items: FiscalOrderReviewItem[] = rawItems
    .map((it: Record<string, unknown>) => {
      const product =
        it.product && typeof it.product === "object"
          ? (it.product as Record<string, unknown>)
          : null;
      return {
        id: String(it.id),
        line_number: Number(it.line_number ?? 0),
        description: String(it.description ?? ""),
        quantity: Number(it.quantity ?? 0),
        unit: String(it.unit ?? "UN"),
        unit_price: Number(it.unit_price ?? 0),
        total_price: Number(it.total_price ?? 0),
        product_id: typeof it.product_id === "string" ? it.product_id : null,
        product_name:
          product && typeof product.name === "string" ? product.name : null,
        ncm: product && typeof product.ncm === "string" ? product.ncm : null,
        product_nature:
          product && typeof product.product_nature === "string"
            ? product.product_nature
            : null,
        icms_rate: it.icms_rate == null ? null : Number(it.icms_rate),
        icms_value: it.icms_value == null ? null : Number(it.icms_value),
        ipi_rate: it.ipi_rate == null ? null : Number(it.ipi_rate),
        ipi_value: it.ipi_value == null ? null : Number(it.ipi_value),
        tax_base: it.tax_base == null ? null : Number(it.tax_base),
      };
    })
    .sort(
      (a: FiscalOrderReviewItem, b: FiscalOrderReviewItem) =>
        a.line_number - b.line_number
    );

  const fiscalStatus = String(order.fiscal_status ?? "pending");
  const statusKey = (
    fiscalStatus in FISCAL_STATUS_LABELS ? fiscalStatus : "pending"
  ) as FiscalStatus;

  const warnings: string[] = [];
  if (items.length === 0) {
    warnings.push("Pedido sem itens.");
  }
  if (items.some((it) => !it.product_id)) {
    warnings.push(
      "Há itens sem produto vinculado — associe o produto com NCM para aplicar regras automaticamente."
    );
  }
  if (items.some((it) => it.product_id && !it.ncm)) {
    warnings.push(
      "Há produtos sem NCM cadastrado — complete o cadastro em Engenharia/Produtos."
    );
  }
  if (!isFiscalConfigured(fiscalStatus)) {
    warnings.push(
      "Fiscal ainda não está alinhado. Use o assistente (IA) ou marque «Fiscal alinhado» após conferir os dados."
    );
  }

  return {
    id: String(order.id),
    order_number: String(order.order_number),
    status: String(order.status),
    order_date: String(order.order_date),
    client_name: String(order.client_name),
    client_document:
      typeof order.client_document === "string" ? order.client_document : null,
    client_address:
      typeof order.client_address === "string" ? order.client_address : null,
    destination_uf: parseUfFromAddress(
      typeof order.client_address === "string" ? order.client_address : null
    ),
    total: Number(order.total ?? 0),
    total_icms: Number(order.total_icms ?? 0),
    total_ipi: Number(order.total_ipi ?? 0),
    total_tax_base: Number(order.total_tax_base ?? 0),
    fiscal_status: fiscalStatus,
    fiscal_status_label: FISCAL_STATUS_LABELS[statusKey],
    fiscal_configured: isFiscalConfigured(fiscalStatus),
    ready_for_invoice: order.ready_for_invoice === true,
    billing_plan:
      typeof order.billing_plan === "string" ? order.billing_plan : null,
    billing_closure:
      typeof order.billing_closure === "string" ? order.billing_closure : null,
    notes: typeof order.notes === "string" ? order.notes : null,
    items,
    warnings,
  };
}

/** Marca o pedido como fiscalmente alinhado (impostos conferidos / sem nota). */
export async function markSalesOrderFiscalAligned(
  admin: Admin,
  tenantId: string,
  salesOrderId: string
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const db = asUntypedAdmin(admin);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("sales_orders") as any)
    .select("id, status, billing_closure, fiscal_status")
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reasons: ["Pedido não encontrado."] };

  const row = data as {
    id: string;
    status: string;
    billing_closure: string | null;
    fiscal_status: string | null;
  };

  if (row.billing_closure) {
    return { ok: false, reasons: ["Pedido já finalizado no faturamento."] };
  }
  if (row.status === "cancelled") {
    return { ok: false, reasons: ["Pedido cancelado."] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (db.from("sales_orders") as any)
    .update({ fiscal_status: "manual_override" })
    .eq("id", salesOrderId)
    .eq("tenant_id", tenantId);

  if (updErr) throw new Error(updErr.message);
  return { ok: true };
}
