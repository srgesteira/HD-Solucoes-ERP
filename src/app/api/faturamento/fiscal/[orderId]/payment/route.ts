import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { coerceSalesOrderInt } from "@/shared/contracts/sales-order.schema";
import { paymentDueFieldsFromBody } from "@/shared/utils/payment-due";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  parseShippingType,
} from "@/modules/vendas/lib/sales/quote-validity";
import { freightPayerFromShippingType } from "@/modules/fiscal/lib/bling/bling-pedido-transporte";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

function parseFreightCost(raw: unknown): number | { error: string } {
  if (raw === undefined || raw === null || raw === "") return 0;
  const v =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(v) || v < 0) {
    return { error: "Valor do frete inválido." };
  }
  return Math.round(v * 100) / 100;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { orderId } = await params;
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return apiError("Body inválido", 400);
  }

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data: existing, error: loadErr } = await db
    .from("sales_orders")
    .select(
      "id, billing_closure, payment_installments, payment_days_to_first_due, payment_days_between_installments, payment_due_mode, payment_fixed_due_dates, shipping_type"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return apiError(loadErr.message, 500);
  const row = existing as {
    billing_closure: string | null;
    payment_installments: number;
    payment_days_to_first_due: number;
    payment_days_between_installments: number;
    shipping_type?: string | null;
  } | null;
  if (!row) return apiError("Pedido não encontrado", 404);
  if (row.billing_closure) {
    return apiError("Pedido já finalizado no faturamento.", 409);
  }

  const update: Record<string, unknown> = {};
  if (body.payment_installments !== undefined) {
    const v = coerceSalesOrderInt(body.payment_installments, 0);
    if (v < 1) return apiError("Número de parcelas inválido", 400);
    update.payment_installments = v;
  }
  if (body.payment_days_to_first_due !== undefined) {
    const v = coerceSalesOrderInt(body.payment_days_to_first_due, -1);
    if (v < 0) return apiError("Dias da 1.ª parcela inválidos", 400);
    update.payment_days_to_first_due = v;
  }
  if (body.payment_days_between_installments !== undefined) {
    const v = coerceSalesOrderInt(body.payment_days_between_installments, -1);
    if (v < 0) return apiError("Intervalo entre parcelas inválido", 400);
    update.payment_days_between_installments = v;
  }
  const nextN = Number(
    update.payment_installments ?? row.payment_installments ?? 1
  );
  const dueParsed = paymentDueFieldsFromBody(body, nextN);
  if (!dueParsed.ok) return apiError(dueParsed.message, 400);
  if (dueParsed.payment_due_mode !== undefined) {
    update.payment_due_mode = dueParsed.payment_due_mode;
  }
  if (dueParsed.payment_fixed_due_dates !== undefined) {
    update.payment_fixed_due_dates = dueParsed.payment_fixed_due_dates;
  }

  if (body.shipping_type !== undefined) {
    const st = parseShippingType(body.shipping_type);
    if (typeof st === "object" && "error" in st) {
      return apiError(st.error, 400);
    }
    update.shipping_type = st;
    update.freight_payer = freightPayerFromShippingType(st);
    if (st !== "CIF" && st !== "FOB") {
      update.freight_cost = 0;
    }
  }
  if (body.freight_cost !== undefined) {
    const nextShipping = String(
      update.shipping_type ?? row.shipping_type ?? "FOB"
    );
    const freight = parseFreightCost(body.freight_cost);
    if (typeof freight === "object" && "error" in freight) {
      return apiError(freight.error, 400);
    }
    update.freight_cost =
      nextShipping === "CIF" || nextShipping === "FOB" ? freight : 0;
  }
  if (body.carrier_name !== undefined) {
    const name = String(body.carrier_name ?? "").trim().slice(0, 120);
    update.carrier_name = name || null;
  }
  if (body.customer_po_number !== undefined) {
    const po = String(body.customer_po_number ?? "").trim().slice(0, 80);
    update.customer_po_number = po || null;
  }

  if (Object.keys(update).length === 0) {
    return apiError("Nenhum campo da nota para actualizar", 400);
  }

  const { error: updErr } = await db
    .from("sales_orders")
    .update(update)
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (updErr) return apiError(updErr.message, 500);

  return apiOk({ ok: true });
}
