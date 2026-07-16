import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { applyFiscalToPurchaseOrderItems } from "@/modules/fiscal/lib/fiscal-rules-service";
import {
  FISCAL_STATUS_LABELS,
  isFiscalConfigured,
} from "@/modules/fiscal/lib/fiscal-rules-types";
import { usageTypeConferenceWarning } from "@/modules/fiscal/lib/item-usage-type-warnings";
import {
  isItemUsageType,
  type ItemUsageType,
} from "@/modules/fiscal/lib/item-usage-type";

type Admin = SupabaseClient<Database>;

export type FiscalPurchaseOrderReviewItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  product_id: string | null;
  product_name: string | null;
  ncm: string | null;
  tax_base: number | null;
  icms_rate: number | null;
  icms_value: number | null;
  ipi_rate: number | null;
  ipi_value: number | null;
  usage_type: ItemUsageType | null;
  line_warnings: string[];
};

export type FiscalPurchaseOrderReview = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  supplier_name: string;
  supplier_document: string | null;
  supplier_uf: string | null;
  total: number;
  total_icms: number;
  total_ipi: number;
  total_tax_base: number;
  freight_cost: number;
  fiscal_status: string;
  fiscal_status_label: string;
  fiscal_configured: boolean;
  fiscal_finalized_at: string | null;
  can_finalize_fiscal: boolean;
  notes: string | null;
  items: FiscalPurchaseOrderReviewItem[];
  warnings: string[];
};

export async function getFiscalPurchaseOrderReview(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string
): Promise<FiscalPurchaseOrderReview | null> {
  const db = asUntypedAdmin(admin);

  const { data: order, error } = await db
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, total, total_icms, total_ipi, total_tax_base, freight_cost, fiscal_status, fiscal_finalized_at, notes, supplier:suppliers(name, document, address_state)"
    )
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  const o = order as {
    id: string;
    po_number: string;
    status: string;
    order_date: string;
    total: number | null;
    total_icms: number | null;
    total_ipi: number | null;
    total_tax_base: number | null;
    freight_cost: number | null;
    fiscal_status: string | null;
    fiscal_finalized_at: string | null;
    notes: string | null;
    supplier?:
      | {
          name?: string | null;
          document?: string | null;
          address_state?: string | null;
        }
      | {
          name?: string | null;
          document?: string | null;
          address_state?: string | null;
        }[]
      | null;
  };

  const supplier = Array.isArray(o.supplier) ? o.supplier[0] : o.supplier;
  const supplierUf =
    typeof supplier?.address_state === "string"
      ? supplier.address_state.trim().toUpperCase() || null
      : null;

  const { data: items, error: itemsError } = await db
    .from("purchase_order_items")
    .select(
      "id, description, quantity, unit, unit_price, total_price, product_id, tax_base, icms_rate, icms_value, ipi_rate, ipi_value, usage_type, product:products(name, ncm)"
    )
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  const warnings: string[] = [];
  const reviewItems: FiscalPurchaseOrderReviewItem[] = (items ?? []).map(
    (raw) => {
      const it = raw as {
        id: string;
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        total_price: number;
        product_id: string | null;
        tax_base: number | null;
        icms_rate: number | null;
        icms_value: number | null;
        ipi_rate: number | null;
        ipi_value: number | null;
        usage_type: string | null;
        product?:
          | { name?: string | null; ncm?: string | null }
          | { name?: string | null; ncm?: string | null }[]
          | null;
      };
      const product = Array.isArray(it.product) ? it.product[0] : it.product;
      const usage =
        it.usage_type && isItemUsageType(it.usage_type) ? it.usage_type : null;
      const lineWarnings: string[] = [];
      const usageWarn = usageTypeConferenceWarning(it.usage_type);
      if (usageWarn) {
        lineWarnings.push(usageWarn);
        warnings.push(`${it.description}: ${usageWarn}`);
      }
      if (!it.product_id) {
        lineWarnings.push("Sem produto associado.");
        warnings.push(`${it.description}: sem produto associado.`);
      }

      return {
        id: it.id,
        description: it.description,
        quantity: Number(it.quantity ?? 0),
        unit: it.unit ?? "",
        unit_price: Number(it.unit_price ?? 0),
        total_price: Number(it.total_price ?? 0),
        product_id: it.product_id,
        product_name: product?.name ?? null,
        ncm: product?.ncm ?? null,
        tax_base: it.tax_base == null ? null : Number(it.tax_base),
        icms_rate: it.icms_rate == null ? null : Number(it.icms_rate),
        icms_value: it.icms_value == null ? null : Number(it.icms_value),
        ipi_rate: it.ipi_rate == null ? null : Number(it.ipi_rate),
        ipi_value: it.ipi_value == null ? null : Number(it.ipi_value),
        usage_type: usage,
        line_warnings: lineWarnings,
      };
    }
  );

  const fiscalStatus = o.fiscal_status ?? "pending";
  const fiscalConfigured = isFiscalConfigured(fiscalStatus);
  if (!fiscalConfigured) {
    warnings.push("Fiscal ainda não conferido — aplique as regras.");
  }

  const fiscalFinalizedAt = o.fiscal_finalized_at ?? null;
  const canFinalize =
    o.status === "received" && fiscalFinalizedAt == null && fiscalConfigured;

  return {
    id: o.id,
    order_number: o.po_number,
    status: o.status,
    order_date: o.order_date,
    supplier_name: supplier?.name ?? "Sem fornecedor",
    supplier_document: supplier?.document ?? null,
    supplier_uf: supplierUf,
    total: Number(o.total ?? 0),
    total_icms: Number(o.total_icms ?? 0),
    total_ipi: Number(o.total_ipi ?? 0),
    total_tax_base: Number(o.total_tax_base ?? 0),
    freight_cost: Number(o.freight_cost ?? 0),
    fiscal_status: fiscalStatus,
    fiscal_status_label:
      FISCAL_STATUS_LABELS[fiscalStatus as keyof typeof FISCAL_STATUS_LABELS] ??
      fiscalStatus,
    fiscal_configured: fiscalConfigured,
    fiscal_finalized_at: fiscalFinalizedAt,
    can_finalize_fiscal: canFinalize,
    notes: o.notes,
    items: reviewItems,
    warnings: [...new Set(warnings)],
  };
}

export async function reapplyFiscalToPurchaseOrder(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string,
  userId: string
): Promise<FiscalPurchaseOrderReview> {
  const db = asUntypedAdmin(admin);
  const { data: po, error } = await db
    .from("purchase_orders")
    .select("id, status, fiscal_finalized_at")
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!po) throw new Error("Pedido de compra não encontrado");
  if (po.status === "cancelled") throw new Error("Pedido cancelado.");
  if (po.fiscal_finalized_at) {
    throw new Error("Conferência fiscal já finalizada — não pode reaplicar.");
  }

  const result = await applyFiscalToPurchaseOrderItems(
    admin,
    tenantId,
    purchaseOrderId,
    userId
  );
  if (result.itemsProcessed === 0) {
    throw new Error(
      "Nenhuma linha com produto processada — associe produtos aos itens."
    );
  }

  const review = await getFiscalPurchaseOrderReview(
    admin,
    tenantId,
    purchaseOrderId
  );
  if (!review) throw new Error("Pedido de compra não encontrado");
  return review;
}

export async function finalizePurchaseOrderFiscal(
  admin: Admin,
  tenantId: string,
  purchaseOrderId: string
): Promise<FiscalPurchaseOrderReview> {
  const db = asUntypedAdmin(admin);
  const { data: po, error } = await db
    .from("purchase_orders")
    .select("id, status, fiscal_status, fiscal_finalized_at")
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .eq("is_suggestion", false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!po) throw new Error("Pedido de compra não encontrado");
  if (po.status !== "received") {
    throw new Error(
      "Só é possível finalizar a conferência fiscal após o recebimento em Compras."
    );
  }
  if (po.fiscal_finalized_at) {
    throw new Error("Conferência fiscal já finalizada.");
  }
  if (!isFiscalConfigured(po.fiscal_status ?? "pending")) {
    throw new Error("Aplique as regras fiscais antes de finalizar.");
  }

  const now = new Date().toISOString();
  const { error: updErr } = await db
    .from("purchase_orders")
    .update({ fiscal_finalized_at: now })
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId);
  if (updErr) throw new Error(updErr.message);

  const review = await getFiscalPurchaseOrderReview(
    admin,
    tenantId,
    purchaseOrderId
  );
  if (!review) throw new Error("Pedido de compra não encontrado");
  return review;
}
