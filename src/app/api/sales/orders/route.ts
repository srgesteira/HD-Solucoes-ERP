import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { SALES_ORDER_STATUSES, type SalesOrderRow } from "@/modules/core/types/sales.types";
import type { SalesOrderProductionSituation } from "@/modules/vendas/lib/sales/sales-order-production-summary";
import {
  insertSalesOrderItemsFromLines,
  nextSalesOrderNumber,
  parseSaleLines,
  generateReceivablesForSalesOrder,
  rollbackSalesOrderCreation,
} from "@/modules/vendas/lib/sales/sales-flow";
import { parseRequiredExpectedDelivery } from "@/shared/contracts/sales-order.schema";
import { isSalesOrderListTab } from "@/modules/vendas/lib/sales/sales-order-list-display";
import {
  buildSalesOrderUniversalSearchOrFilter,
  resolveSalesOrderIdsFromUniversalSearch,
} from "@/modules/core/lib/universal-search-query";
import { escapeIlike } from "@/shared/utils/universal-search";
import {
  enrichSalesOrdersListWithProduction,
  type SalesOrderProductionSummary,
} from "@/modules/vendas/lib/sales/sales-order-production-summary";

export const dynamic = "force-dynamic";

const SO_SET = new Set<string>(SALES_ORDER_STATUSES);

function optionalPaymentInt(b: Record<string, unknown>, key: string, def: number): number {
  if (b[key] === undefined || b[key] === null) return def;
  const v =
    typeof b[key] === "number" ? b[key] : parseInt(String(b[key]), 10);
  if (!Number.isFinite(v) || v < 0) return Number.NaN;
  return v;
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
    const suggestion = await nextSalesOrderNumber(adminSuggest, tenantId);
    return apiOk({ suggestion });
  }

  const tabParam = searchParams.get("tab")?.trim() ?? "all";
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
    .from("sales_orders")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .neq("status", "superseded");

  if (!isSalesOrderListTab(tabParam)) {
    return apiError("Aba inválida", 400);
  }

  switch (tabParam) {
    case "all":
      break;
    case "open":
      query = query.in("status", ["pending", "confirmed", "in_production"]);
      break;
    case "finished":
      query = query.in("status", ["delivered", "shipped"]);
      break;
    case "cancelled":
      query = query.eq("status", "cancelled");
      break;
    case "ready":
      query = query
        .eq("ready_for_invoice", true)
        .in("status", ["pending", "confirmed", "in_production", "shipped"]);
      break;
  }

  if (status && status !== "all") {
    if (!SO_SET.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (rawSearch) {
    const orderIdsFromProducts = await resolveSalesOrderIdsFromUniversalSearch(
      admin,
      tenantId,
      rawSearch
    );
    const orFilter = buildSalesOrderUniversalSearchOrFilter(
      rawSearch,
      orderIdsFromProducts
    );
    if (orFilter) {
      query = query.or(orFilter);
    } else {
      const safe = `%${escapeIlike(rawSearch)}%`;
      query = query.or(
        `client_name.ilike.${safe},client_document.ilike.${safe},client_email.ilike.${safe},order_number.ilike.${safe}`
      );
    }
  }

  if (dateFrom) {
    query = query.gte("order_date", dateFrom.slice(0, 10));
  }
  if (dateTo) {
    query = query.lte("order_date", dateTo.slice(0, 10));
  }

  const { data, error, count } = await query
    .order("order_date", { ascending: false })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar pedidos de venda: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const rows = (data ?? []) as SalesOrderRow[];
  const orderIds = rows.map((r) => r.id);
  let productionByOrder = new Map<string, SalesOrderProductionSummary>();

  try {
    productionByOrder = await enrichSalesOrdersListWithProduction(
      admin,
      tenantId,
      orderIds
    );
  } catch (enrichErr) {
    const msg =
      enrichErr instanceof Error ? enrichErr.message : "Erro ao carregar produção";
    return apiError("Erro ao enriquecer listagem: " + msg, 500);
  }

  const enriched = rows.map((row) => {
    const prod = productionByOrder.get(row.id);
    return {
      ...row,
      production_deadline: prod?.production_deadline ?? null,
      production_situation:
        (prod?.production_situation ?? "none") as SalesOrderProductionSituation,
    };
  });

  return apiOk({
    data: enriched,
    pagination: { page, limit, total: count ?? 0 },
    tab: tabParam,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const parsedLines = parseSaleLines(b.items);
  if (!parsedLines.ok) {
    return apiError(parsedLines.message, 400);
  }

  const client_name =
    typeof b.client_name === "string" ? b.client_name.trim() : "";
  if (!client_name) return apiError("Nome do cliente é obrigatório", 400);

  const order_number =
    typeof b.order_number === "string" && b.order_number.trim()
      ? b.order_number.trim()
      : await nextSalesOrderNumber(createSupabaseAdminClient(), tenantId);

  const pi = optionalPaymentInt(b, "payment_installments", 1);
  const pd1 = optionalPaymentInt(b, "payment_days_to_first_due", 30);
  const pdb = optionalPaymentInt(b, "payment_days_between_installments", 30);
  if ([pi, pd1, pdb].some((x) => !Number.isFinite(x))) {
    return apiError("Parâmetros de pagamento inválidos", 400);
  }
  if (pi < 1) return apiError("payment_installments mínimo 1", 400);

  const admin = createSupabaseAdminClient();

  const quote_id =
    b.quote_id === undefined || b.quote_id === null
      ? null
      : String(b.quote_id);
  if (quote_id) {
    const { data: q } = await admin
      .from("quotes")
      .select("id")
      .eq("id", quote_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!q) return apiError("Orçamento inválido", 400);
  }

  const productIds = parsedLines.lines
    .map((l) => l.product_id)
    .filter((id): id is string => Boolean(id));
  if (productIds.length) {
    const { data: prods, error: pErr } = await admin
      .from("products")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", productIds);
    if (pErr) {
      return apiError(
        "Erro ao validar produtos: " + pErr.message,
        supabaseErrorToHttp(pErr.code)
      );
    }
    const found = new Set((prods ?? []).map((p) => p.id));
    for (const id of [...new Set(productIds)]) {
      if (!found.has(id)) return apiError("Produto inválido: " + id, 400);
    }
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const order_date =
    b.order_date === undefined || b.order_date === null
      ? new Date().toISOString().slice(0, 10)
      : String(b.order_date).slice(0, 10);

  const expectedParsed = parseRequiredExpectedDelivery(b.expected_delivery);
  if (!expectedParsed.ok) {
    return apiError(expectedParsed.message, 400);
  }
  const expected_delivery = expectedParsed.value;

  const pcp_deadline =
    b.pcp_deadline === undefined || b.pcp_deadline === null
      ? null
      : String(b.pcp_deadline).slice(0, 10);

  const discount =
    b.discount === undefined || b.discount === null
      ? 0
      : typeof b.discount === "number"
        ? b.discount
        : parseFloat(String(b.discount));

  const tax =
    b.tax === undefined || b.tax === null
      ? 0
      : typeof b.tax === "number"
        ? b.tax
        : parseFloat(String(b.tax));

  if (!Number.isFinite(discount) || discount < 0) {
    return apiError("Desconto inválido", 400);
  }
  if (!Number.isFinite(tax) || tax < 0) {
    return apiError("Imposto inválido", 400);
  }

  const notes =
    b.notes === undefined || b.notes === null
      ? null
      : String(b.notes).trim() || null;

  const st = b.status !== undefined ? String(b.status) : "pending";
  if (!SO_SET.has(st)) return apiError("Status inválido", 400);

  const { data: row, error: insErr } = await admin
    .from("sales_orders")
    .insert({
      tenant_id: tenantId,
      order_number,
      quote_id,
      client_name,
      client_document:
        b.client_document === undefined || b.client_document === null
          ? null
          : String(b.client_document).trim() || null,
      client_email:
        b.client_email === undefined || b.client_email === null
          ? null
          : String(b.client_email).trim() || null,
      client_phone:
        b.client_phone === undefined || b.client_phone === null
          ? null
          : String(b.client_phone).trim() || null,
      client_address:
        b.client_address === undefined || b.client_address === null
          ? null
          : String(b.client_address).trim() || null,
      order_date,
      expected_delivery,
      pcp_deadline,
      discount,
      tax,
      notes,
      status: st,
      created_by: profile?.id ?? null,
      payment_installments: pi,
      payment_days_to_first_due: pd1,
      payment_days_between_installments: pdb,
    })
    .select()
    .single();

  if (insErr?.code === "23505") {
    return apiError("Número do pedido já existe", 409);
  }
  if (insErr) {
    return apiError(
      "Erro ao criar pedido de venda: " + insErr.message,
      supabaseErrorToHttp(insErr.code)
    );
  }

  const itemErr = await insertSalesOrderItemsFromLines(
    admin,
    tenantId,
    row.id,
    parsedLines.lines
  );
  if (itemErr.error) {
    await admin.from("sales_orders").delete().eq("id", row.id).eq("tenant_id", tenantId);
    return apiError("Erro ao gravar itens: " + itemErr.error, 500);
  }

  const { data: fresh, error: frErr } = await admin
    .from("sales_orders")
    .select("*")
    .eq("id", row.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (frErr || !fresh) {
    await rollbackSalesOrderCreation(admin, tenantId, row.id);
    return apiError("Erro ao recarregar pedido", 500);
  }

  const recv = await generateReceivablesForSalesOrder(
    admin,
    tenantId,
    {
      id: fresh.id,
      order_number: fresh.order_number,
      order_date: fresh.order_date,
      total: fresh.total,
      client_name: fresh.client_name,
      client_document: fresh.client_document,
      payment_installments: fresh.payment_installments,
      payment_days_to_first_due: fresh.payment_days_to_first_due,
      payment_days_between_installments: fresh.payment_days_between_installments,
    },
    { provisional: true }
  );

  if (recv.error) {
    await rollbackSalesOrderCreation(admin, tenantId, row.id);
    return apiError(
      "Erro ao gerar contas a receber: " + recv.error,
      500
    );
  }

  const { data: detail, error: dErr } = await admin
    .from("sales_orders")
    .select(
      `
      *,
      items:sales_order_items(
        *,
        product:products!sales_order_items_product_id_fkey(*)
      ),
      quote:quotes!sales_orders_quote_id_fkey(*),
      production_order:production_orders!sales_orders_production_order_id_fkey(*)
    `
    )
    .eq("id", row.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (dErr) {
    return apiOk({ data: fresh }, 201);
  }

  return apiOk({ data: detail }, 201);
}
