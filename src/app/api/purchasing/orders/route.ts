import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { computePurchaseOrderTotal } from "@/modules/compras/lib/purchasing/purchase-order-totals";
import {
  syncPurchaseOrderItems,
  type PurchaseOrderLineInput,
} from "@/modules/compras/lib/purchasing/purchase-order-edit";
import { purchaseOrderItemsPayloadSchema } from "@/shared/contracts/purchase-order.schema";
import { lineSubtotal, roundMoney } from "@/modules/compras/lib/purchasing/purchase-order-item-taxes";
import {
  coerceSalesOrderInt,
  parsePaymentDaysBetween,
} from "@/shared/contracts/sales-order.schema";

export const dynamic = "force-dynamic";

const LIST_SELECT = `
  *,
  supplier:suppliers(*)
`.trim();

const ORDER_DETAIL_SELECT =
  `
  *,
  supplier:suppliers(*),
  items:purchase_order_items(
    *,
    product:products!purchase_order_items_product_id_fkey(*),
    production_order:production_orders!purchase_order_items_production_order_id_fkey(*)
  ),
  requested_by_user:user_profiles!purchase_orders_requested_by_fkey(*),
  approved_by_user:user_profiles!purchase_orders_approved_by_fkey(*)
`.trim();

const PO_STATUSES = new Set([
  "draft",
  "sent",
  "confirmed",
  "partial",
  "received",
  "cancelled",
]);

/** Escapa `%` e `_` para `.ilike`. */
function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseMoney(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplier_id");
  const search = searchParams.get("search")?.trim();
  const page = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10) || 25)
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("purchase_orders")
    .select(LIST_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (status && status !== "all") {
    if (!PO_STATUSES.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (supplierId?.trim()) {
    query = query.eq("supplier_id", supplierId.trim());
  }

  if (search) {
    const safe = `%${escapeIlike(search)}%`;
    query = query.ilike("po_number", safe);
  }

  const { data, error, count } = await query
    .order("order_date", { ascending: false })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar pedidos de compra: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão para criar pedidos de compra", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const po_number =
    typeof b.po_number === "string" ? b.po_number.trim() : "";

  const supplier_id =
    b.supplier_id === undefined || b.supplier_id === null
      ? null
      : String(b.supplier_id);

  const order_date =
    b.order_date === undefined || b.order_date === null
      ? new Date().toISOString().slice(0, 10)
      : String(b.order_date).slice(0, 10);

  const expected_delivery =
    b.expected_delivery === undefined || b.expected_delivery === null
      ? null
      : String(b.expected_delivery).slice(0, 10);

  const notes =
    b.notes === undefined || b.notes === null
      ? null
      : String(b.notes).trim() || null;

  const discount =
    b.discount !== undefined
      ? parseMoney(b.discount)
      : 0;
  if (discount === null) return apiError("Desconto inválido", 400);

  const tax =
    b.tax !== undefined ? parseMoney(b.tax) : 0;
  if (tax === null) return apiError("Imposto inválido", 400);

  const freight_cost =
    b.freight_cost !== undefined ? parseMoney(b.freight_cost) : 0;
  if (freight_cost === null) return apiError("Frete inválido", 400);

  const insurance_cost =
    b.insurance_cost !== undefined ? parseMoney(b.insurance_cost) : 0;
  if (insurance_cost === null) return apiError("Seguro inválido", 400);

  const other_costs =
    b.other_costs !== undefined ? parseMoney(b.other_costs) : 0;
  if (other_costs === null) return apiError("Outros custos inválidos", 400);

  const total_tax_non_creditable =
    b.total_tax_non_creditable !== undefined
      ? parseMoney(b.total_tax_non_creditable)
      : 0;
  if (total_tax_non_creditable === null) {
    return apiError("Impostos não creditáveis inválidos", 400);
  }

  let payment_installments = 1;
  if (b.payment_installments !== undefined && b.payment_installments !== null) {
    const v = coerceSalesOrderInt(b.payment_installments, 0);
    if (v < 1) return apiError("payment_installments inválido", 400);
    payment_installments = v;
  }

  let payment_days_to_first_due = 30;
  if (
    b.payment_days_to_first_due !== undefined &&
    b.payment_days_to_first_due !== null
  ) {
    const v = coerceSalesOrderInt(b.payment_days_to_first_due, -1);
    if (v < 0) return apiError("payment_days_to_first_due inválido", 400);
    payment_days_to_first_due = v;
  }

  const payment_days_between_installments =
    b.payment_days_between_installments !== undefined
      ? parsePaymentDaysBetween(b.payment_days_between_installments)
      : 0;

  const admin = createSupabaseAdminClient();

  if (supplier_id) {
    const { data: sup } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", supplier_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!sup) return apiError("Fornecedor inválido", 400);
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  let subtotal = 0;
  let linesForSync: PurchaseOrderLineInput[] | null = null;
  if (b.items !== undefined) {
    const zItems = purchaseOrderItemsPayloadSchema.safeParse(b.items);
    if (!zItems.success) {
      return apiError(
        zItems.error.issues[0]?.message ?? "Itens inválidos",
        400
      );
    }
    linesForSync = zItems.data.map((row) => {
      const sub = lineSubtotal(row.quantity, row.unit_price);
      const tax_base =
        row.tax_base !== undefined
          ? roundMoney(row.tax_base)
          : roundMoney(sub + row.ipi_value);
      return {
        product_id: row.product_id,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        icms_rate: row.icms_rate,
        icms_value: row.icms_value,
        ipi_rate: row.ipi_rate,
        ipi_value: row.ipi_value,
        tax_base,
      };
    });
  }

  const { data: inserted, error } = await admin
    .from("purchase_orders")
    .insert({
      tenant_id: tenantId,
      po_number: po_number || "",
      supplier_id,
      order_date,
      expected_delivery,
      notes,
      status: "draft",
      requested_by: profile?.id ?? null,
      discount,
      tax,
      freight_cost,
      insurance_cost,
      other_costs,
      total_tax_non_creditable,
      payment_installments,
      payment_days_to_first_due,
      payment_days_between_installments,
      subtotal: 0,
      total: 0,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    return apiError("Número de pedido já existe", 409);
  }
  if (error) {
    return apiError(
      "Erro ao criar pedido de compra: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const orderId = inserted.id;

  let total_icms = 0;
  let total_ipi = 0;
  let total_tax_base = 0;

  if (linesForSync) {
    const sync = await syncPurchaseOrderItems(
      admin,
      tenantId,
      orderId,
      linesForSync
    );
    if (!sync.ok) {
      await admin.from("purchase_orders").delete().eq("id", orderId);
      return apiError(sync.message, 400);
    }
    subtotal = sync.subtotal;
    total_icms = sync.total_icms;
    total_ipi = sync.total_ipi;
    total_tax_base = sync.total_tax_base;
  }

  const total = computePurchaseOrderTotal({
    subtotal,
    discount,
    tax,
    total_icms,
    total_ipi,
    freight_cost,
    insurance_cost,
    other_costs,
    total_tax_non_creditable,
  });

  const { error: totalsErr } = await admin
    .from("purchase_orders")
    .update({ subtotal, total_icms, total_ipi, total_tax_base, total })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);

  if (totalsErr) {
    return apiError(
      "Pedido criado, mas falhou ao actualizar totais: " + totalsErr.message,
      500
    );
  }

  const { data: detail, error: detailErr } = await admin
    .from("purchase_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (detailErr) {
    return apiError(
      "Pedido criado, mas falhou ao recarregar: " + detailErr.message,
      500
    );
  }

  return apiOk({ data: detail ?? { id: orderId } }, 201);
}
