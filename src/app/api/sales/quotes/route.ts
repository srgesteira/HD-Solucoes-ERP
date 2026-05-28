import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { QUOTE_STATUSES } from "@/modules/core/types/sales.types";
import { insertQuoteItemsFromLines, nextQuoteNumber } from "@/modules/vendas/lib/sales/sales-flow";
import {
  refreshQuoteHeaderTotals,
  resolveQuoteItemsFromPayload,
} from "@/modules/vendas/lib/sales/quote-items-resolve";
import { fetchCustomerForTenant } from "@/modules/vendas/lib/sales/quote-customer";
import {
  parseQuoteHeaderFromBody,
  quoteHeaderToInsert,
} from "@/modules/vendas/lib/sales/quote-payload";
import { createQuoteBodySchema } from "@/shared/contracts/quote.schema";

export const dynamic = "force-dynamic";

const QUOTE_SET = new Set<string>(QUOTE_STATUSES);

function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const searchParams = request.nextUrl.searchParams;

  if (searchParams.get("suggest_number") === "1") {
    if (!(await isCurrentUserTenantAdmin())) {
      return apiError("Acesso negado", 403);
    }
    const adminSuggest = createSupabaseAdminClient();
    const suggestion = await nextQuoteNumber(adminSuggest, tenantId);
    return apiOk({ suggestion });
  }

  const status = searchParams.get("status");
  const rawSearch =
    searchParams.get("search")?.trim() ??
    searchParams.get("client")?.trim() ??
    "";
  const dateFrom = searchParams.get("date_from")?.trim();
  const dateTo = searchParams.get("date_to")?.trim();

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
    .from("quotes")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (status && status !== "all") {
    if (!QUOTE_SET.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (rawSearch) {
    const safe = `%${escapeIlike(rawSearch)}%`;
    query = query.or(
      `quote_number.ilike.${safe},client_name.ilike.${safe},client_email.ilike.${safe}`
    );
  }

  if (dateFrom) {
    query = query.gte("quote_date", dateFrom.slice(0, 10));
  }
  if (dateTo) {
    query = query.lte("quote_date", dateTo.slice(0, 10));
  }

  const { data, error, count } = await query
    .order("quote_date", { ascending: false })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar orçamentos: " + error.message,
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
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem criar orçamentos", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  console.log("[POST /api/sales/quotes] body recebido", {
    customer_id: b.customer_id,
    client_name: b.client_name,
    quote_number: b.quote_number,
    itemsCount: Array.isArray(b.items) ? b.items.length : null,
    keys: Object.keys(b),
  });

  const parsedBody = createQuoteBodySchema.safeParse(b);
  if (!parsedBody.success) {
    const first = parsedBody.error.issues[0];
    const message =
      first?.message ?? "Dados do orçamento inválidos";
    console.error("[POST /api/sales/quotes] validação", parsedBody.error.issues);
    return apiError(message, 400);
  }

  const quote_number =
    typeof b.quote_number === "string" && b.quote_number.trim()
      ? b.quote_number.trim()
      : await nextQuoteNumber(createSupabaseAdminClient(), tenantId);

  const admin = createSupabaseAdminClient();

  const customerId = parsedBody.data.customer_id;

  const customer = await fetchCustomerForTenant(admin, tenantId, customerId);
  if (!customer) {
    console.error("[POST /api/sales/quotes] cliente inválido", {
      customerId,
      tenantId,
    });
    return apiError("Cliente inválido ou inativo", 400);
  }

  const resolvedItems = await resolveQuoteItemsFromPayload(
    admin,
    tenantId,
    parsedBody.data.items
  );
  if (!resolvedItems.ok) {
    console.error("[POST /api/sales/quotes] itens inválidos", {
      message: resolvedItems.message,
      items: b.items,
    });
    return apiError(resolvedItems.message, 400);
  }

  const clientNameForQuote =
    typeof b.client_name === "string" && b.client_name.trim()
      ? b.client_name.trim()
      : customer.name;

  const headerParsed = parseQuoteHeaderFromBody(
    { ...b, customer_id: customerId },
    clientNameForQuote
  );
  if (!headerParsed.ok) return apiError(headerParsed.message, 400);

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const discount =
    b.discount === undefined || b.discount === null
      ? undefined
      : typeof b.discount === "number"
        ? b.discount
        : parseFloat(String(b.discount));

  const tax =
    b.tax === undefined || b.tax === null
      ? undefined
      : typeof b.tax === "number"
        ? b.tax
        : parseFloat(String(b.tax));

  if (
    discount !== undefined &&
    (!Number.isFinite(discount) || discount < 0)
  ) {
    return apiError("Desconto inválido", 400);
  }
  if (tax !== undefined && (!Number.isFinite(tax) || tax < 0)) {
    return apiError("Imposto inválido", 400);
  }

  const insertRow = quoteHeaderToInsert(headerParsed.data, {
    tenant_id: tenantId,
    quote_number,
    status: "draft",
    created_by: profile?.id ?? null,
    ...(discount !== undefined ? { discount } : {}),
    ...(tax !== undefined ? { tax } : {}),
  });

  const { data: row, error: insErr } = await admin
    .from("quotes")
    .insert(insertRow)
    .select()
    .single();

  if (insErr?.code === "23505") {
    return apiError("Número do orçamento já existe", 409);
  }
  if (insErr) {
    console.error("[POST /api/sales/quotes] insert quote", insErr);
    return apiError(
      "Erro ao criar orçamento: " + insErr.message,
      supabaseErrorToHttp(insErr.code)
    );
  }

  const qErr = await insertQuoteItemsFromLines(
    admin,
    tenantId,
    row.id,
    resolvedItems.lines
  );
  if (qErr.error) {
    console.error("[POST /api/sales/quotes] insert items", qErr.error);
    await admin.from("quotes").delete().eq("id", row.id).eq("tenant_id", tenantId);
    return apiError("Erro ao gravar itens: " + qErr.error, 500);
  }

  await refreshQuoteHeaderTotals(admin, row.id, tenantId);

  const { data: full } = await admin
    .from("quotes")
    .select("*")
    .eq("id", row.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return apiOk({ data: full ?? row }, 201);
}
