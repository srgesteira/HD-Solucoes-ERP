import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  currentUserCanModule,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { quoteStatusAllowsContentEdit } from "@/modules/vendas/lib/sales/quote-access";
import { quoteStatusBumpsRevisionOnContentSave } from "@/modules/vendas/lib/sales/quote-revision";
import { QUOTE_STATUSES, type QuoteUpdate } from "@/modules/core/types/sales.types";
import { fetchCustomerForTenant } from "@/modules/vendas/lib/sales/quote-customer";
import { parsePaymentTermsFromText } from "@/modules/vendas/lib/sales/parse-payment-terms";
import { resolveQuoteDeliveryFromBody } from "@/modules/vendas/lib/sales/quote-delivery";
import {
  computeValidUntil,
  parseQuoteFreightCost,
  parseShippingType,
  parseValidityDays,
} from "@/modules/vendas/lib/sales/quote-validity";
import {
  replaceQuoteItemsFromLines,
  type SaleLineInput,
} from "@/modules/vendas/lib/sales/sales-flow";
import {
  refreshQuoteHeaderTotals,
  resolveQuoteItemsFromPayload,
} from "@/modules/vendas/lib/sales/quote-items-resolve";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const QUOTE_SET = new Set<string>(QUOTE_STATUSES);

const QUOTE_DETAIL_SELECT = `
  *,
  customer:customers(id, name, document, email, phone, address),
  items:quote_items(
    *,
    product:products!quote_items_product_id_fkey(*)
  ),
  converted_sale:sales_orders!quotes_converted_to_sale_fk(*),
  created_by_user:user_profiles!quotes_created_by_fkey(id, full_name, email)
`.trim();

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar orçamento: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Orçamento não encontrado", 404);

  return apiOk({ data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("quotes")
    .select("quote_date, validity_days, status, shipping_type, revision_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return apiError("Orçamento não encontrado", 404);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canSales = await currentUserCanModule("sales");
  const canEditQuote = isAdmin || canSales;

  const hasContentFields =
    b.items !== undefined ||
    b.customer_id !== undefined ||
    b.client_email !== undefined ||
    b.quote_date !== undefined ||
    b.validity_days !== undefined ||
    b.valid_until !== undefined ||
    b.payment_terms !== undefined ||
    b.delivery_business_days !== undefined ||
    b.delivery_deadline !== undefined ||
    b.expected_delivery_date !== undefined ||
    b.payment_installments !== undefined ||
    b.payment_days_to_first_due !== undefined ||
    b.payment_days_between_installments !== undefined ||
    b.shipping_type !== undefined ||
    b.freight_cost !== undefined ||
    b.notes !== undefined ||
    b.quote_number !== undefined ||
    b.discount !== undefined ||
    b.tax !== undefined ||
    b.subtotal !== undefined ||
    b.bdi_percentage !== undefined ||
    b.bdi_value !== undefined ||
    b.base_cost !== undefined;

  if (hasContentFields && !canEditQuote) {
    return apiError("Sem permissão para editar orçamentos", 403);
  }

  if (hasContentFields && !quoteStatusAllowsContentEdit(existing.status)) {
    return apiError(
      "Este orçamento não pode ser alterado no estado actual",
      400
    );
  }

  if (b.status !== undefined && !isAdmin && !canSales) {
    return apiError("Sem permissão para alterar o estado do orçamento", 403);
  }

  let resolvedItemLines: SaleLineInput[] | null = null;
  if (b.items !== undefined) {
    if (!quoteStatusAllowsContentEdit(existing.status)) {
      return apiError(
        "Não é possível alterar itens neste estado do orçamento",
        400
      );
    }
    const resolved = await resolveQuoteItemsFromPayload(
      admin,
      tenantId,
      b.items
    );
    if (!resolved.ok) return apiError(resolved.message, 400);
    resolvedItemLines = resolved.lines;
  }

  const updateData: QuoteUpdate = {};

  if (b.customer_id !== undefined) {
    const cid =
      b.customer_id === null ? "" : String(b.customer_id).trim();
    if (!cid) return apiError("Cliente inválido", 400);
    const customer = await fetchCustomerForTenant(admin, tenantId, cid);
    if (!customer) return apiError("Cliente inválido ou inativo", 400);
    updateData.customer_id = cid;
    updateData.client_name = customer.name;
  }
  if (b.client_email !== undefined) {
    updateData.client_email =
      b.client_email === null ? null : String(b.client_email).trim() || null;
  }
  if (b.quote_date !== undefined) {
    if (b.quote_date === null) return apiError("quote_date não pode ser nulo", 400);
    updateData.quote_date = String(b.quote_date).slice(0, 10);
  }
  if (b.validity_days !== undefined) {
    const vd = parseValidityDays(b.validity_days, existing.validity_days ?? 30);
    if (typeof vd === "object" && "error" in vd) {
      return apiError(vd.error, 400);
    }
    updateData.validity_days = vd as number;
  }
  if (b.payment_terms !== undefined) {
    updateData.payment_terms =
      b.payment_terms === null
        ? null
        : String(b.payment_terms).trim() || null;
    if (updateData.payment_terms) {
      const parsed = parsePaymentTermsFromText(updateData.payment_terms);
      if (parsed) {
        updateData.payment_installments = parsed.installments;
        updateData.payment_days_to_first_due = parsed.daysToFirstDue;
        updateData.payment_days_between_installments =
          parsed.daysBetweenInstallments;
      }
    }
  }
  if (b.delivery_business_days !== undefined) {
    const quoteDateForDelivery = String(
      updateData.quote_date ?? existing.quote_date
    ).slice(0, 10);
    if (b.delivery_business_days === null || b.delivery_business_days === "") {
      updateData.expected_delivery_date = null;
      updateData.delivery_deadline = null;
    } else {
      const resolved = resolveQuoteDeliveryFromBody(
        { delivery_business_days: b.delivery_business_days },
        quoteDateForDelivery
      );
      if ("error" in resolved) return apiError(resolved.error, 400);
      updateData.expected_delivery_date = resolved.expected_delivery_date;
      updateData.delivery_deadline = resolved.delivery_deadline;
    }
  }
  if (b.delivery_deadline !== undefined) {
    updateData.delivery_deadline =
      b.delivery_deadline === null
        ? null
        : String(b.delivery_deadline).trim() || null;
  }
  if (b.expected_delivery_date !== undefined) {
    if (b.expected_delivery_date === null) {
      updateData.expected_delivery_date = null;
    } else {
      const d = String(b.expected_delivery_date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return apiError("expected_delivery_date inválida", 400);
      }
      updateData.expected_delivery_date = d;
    }
  }
  if (b.payment_installments !== undefined && b.payment_installments !== null) {
    const v =
      typeof b.payment_installments === "number"
        ? b.payment_installments
        : parseInt(String(b.payment_installments), 10);
    if (!Number.isFinite(v) || v < 1) {
      return apiError("payment_installments inválido", 400);
    }
    updateData.payment_installments = v;
  }
  if (
    b.payment_days_to_first_due !== undefined &&
    b.payment_days_to_first_due !== null
  ) {
    const v =
      typeof b.payment_days_to_first_due === "number"
        ? b.payment_days_to_first_due
        : parseInt(String(b.payment_days_to_first_due), 10);
    if (!Number.isFinite(v) || v < 0) {
      return apiError("payment_days_to_first_due inválido", 400);
    }
    updateData.payment_days_to_first_due = v;
  }
  if (
    b.payment_days_between_installments !== undefined &&
    b.payment_days_between_installments !== null
  ) {
    const v =
      typeof b.payment_days_between_installments === "number"
        ? b.payment_days_between_installments
        : parseInt(String(b.payment_days_between_installments), 10);
    if (!Number.isFinite(v) || v < 0) {
      return apiError("payment_days_between_installments inválido", 400);
    }
    updateData.payment_days_between_installments = v;
  }
  if (b.shipping_type !== undefined) {
    const st = parseShippingType(b.shipping_type);
    if (typeof st === "object" && "error" in st) {
      return apiError(st.error, 400);
    }
    updateData.shipping_type = st as string;
    if ((st as string) !== "CIF") {
      updateData.freight_cost = 0;
    }
  }
  if (b.freight_cost !== undefined) {
    const nextShipping =
      updateData.shipping_type ?? existing.shipping_type ?? "FOB";
    const freight = parseQuoteFreightCost(b.freight_cost, nextShipping);
    if (typeof freight === "object" && "error" in freight) {
      return apiError(freight.error, 400);
    }
    updateData.freight_cost = freight as number;
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes === null ? null : String(b.notes).trim() || null;
  }

  const nextQuoteDate = updateData.quote_date ?? existing.quote_date;
  const nextValidityDays =
    updateData.validity_days ?? existing.validity_days ?? 30;
  if (
    b.quote_date !== undefined ||
    b.validity_days !== undefined ||
    b.valid_until !== undefined
  ) {
    try {
      updateData.valid_until = computeValidUntil(
        String(nextQuoteDate),
        Number(nextValidityDays)
      );
    } catch (e) {
      return apiError(
        e instanceof Error ? e.message : "Validade inválida",
        400
      );
    }
  }
  if (b.quote_number !== undefined) {
    const n = typeof b.quote_number === "string" ? b.quote_number.trim() : "";
    if (!n) return apiError("Número do orçamento inválido", 400);
    updateData.quote_number = n;
  }
  const willBumpRevision =
    (hasContentFields || resolvedItemLines !== null) &&
    quoteStatusBumpsRevisionOnContentSave(existing.status);

  if (willBumpRevision) {
    updateData.revision_number = Number(existing.revision_number ?? 0) + 1;
  }

  if (b.status !== undefined) {
    const st = String(b.status);
    if (!QUOTE_SET.has(st)) return apiError("Status inválido", 400);

    if (!isAdmin && canSales && st !== "sent") {
      return apiError(
        "Apenas administradores podem alterar para este estado",
        403
      );
    }

    if (st === "sent" && !["draft", "revision"].includes(existing.status)) {
      return apiError(
        "Só é possível enviar orçamentos em rascunho ou em revisão",
        400
      );
    }

    if (st === "revision") {
      const notes =
        typeof b.revision_notes === "string" ? b.revision_notes.trim() : "";
      if (!notes) {
        return apiError("Informe o motivo da revisão", 400);
      }
      updateData.revision_notes = notes;
    }

    if (st === "draft") {
      updateData.revision_notes = null;
    }

    updateData.status = st;
  }

  if (b.revision_notes !== undefined && b.status === undefined) {
    updateData.revision_notes =
      b.revision_notes === null
        ? null
        : String(b.revision_notes).trim() || null;
  }
  if (b.discount !== undefined) {
    const v =
      typeof b.discount === "number"
        ? b.discount
        : parseFloat(String(b.discount));
    if (!Number.isFinite(v) || v < 0) return apiError("Desconto inválido", 400);
    updateData.discount = v;
  }
  if (b.tax !== undefined) {
    const v =
      typeof b.tax === "number" ? b.tax : parseFloat(String(b.tax));
    if (!Number.isFinite(v) || v < 0) return apiError("Imposto inválido", 400);
    updateData.tax = v;
  }
  if (b.subtotal !== undefined) {
    const v =
      typeof b.subtotal === "number"
        ? b.subtotal
        : parseFloat(String(b.subtotal));
    if (!Number.isFinite(v) || v < 0) return apiError("Subtotal inválido", 400);
    updateData.subtotal = v;
  }
  if (b.bdi_percentage !== undefined) {
    updateData.bdi_percentage =
      b.bdi_percentage === null
        ? null
        : typeof b.bdi_percentage === "number"
          ? b.bdi_percentage
          : parseFloat(String(b.bdi_percentage));
  }
  if (b.bdi_value !== undefined) {
    updateData.bdi_value =
      b.bdi_value === null
        ? null
        : typeof b.bdi_value === "number"
          ? b.bdi_value
          : parseFloat(String(b.bdi_value));
  }
  if (b.base_cost !== undefined) {
    updateData.base_cost =
      b.base_cost === null
        ? null
        : typeof b.base_cost === "number"
          ? b.base_cost
          : parseFloat(String(b.base_cost));
  }

  if (Object.keys(updateData).length === 0 && !resolvedItemLines) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  if (Object.keys(updateData).length > 0) {
    const { data: updated, error } = await admin
      .from("quotes")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .maybeSingle();

    if (error?.code === "23505") {
      return apiError("Número do orçamento já existe", 409);
    }
    if (error) {
      return apiError(
        "Erro ao atualizar orçamento: " + error.message,
        supabaseErrorToHttp(error.code)
      );
    }
    if (!updated) return apiError("Orçamento não encontrado", 404);
  }

  if (resolvedItemLines) {
    const rep = await replaceQuoteItemsFromLines(
      admin,
      tenantId,
      id,
      resolvedItemLines
    );
    if (rep.error) {
      return apiError("Erro ao atualizar itens: " + rep.error, 500);
    }
    await refreshQuoteHeaderTotals(admin, id, tenantId);
  }

  const { data: full, error: fetchErr } = await admin
    .from("quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) {
    return apiError(
      "Erro ao carregar orçamento: " + fetchErr.message,
      supabaseErrorToHttp(fetchErr.code)
    );
  }
  if (!full) return apiError("Orçamento não encontrado", 404);

  return apiOk({ data: full });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: deleted, error } = await admin
    .from("quotes")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao excluir orçamento: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!deleted) return apiError("Orçamento não encontrado", 404);

  return apiOk({ success: true });
}
