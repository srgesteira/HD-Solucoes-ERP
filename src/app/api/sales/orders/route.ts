import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { SALES_ORDER_STATUSES } from "@/lib/types/sales.types";
import {
  insertSalesOrderItemsFromLines,
  nextSalesOrderNumber,
  parseSaleLines,
  generateReceivablesForSalesOrder,
  ensureProductionOrderForSales,
  rollbackSalesOrderCreation,
} from "@/lib/sales/sales-flow";

export const dynamic = "force-dynamic";

const SO_SET = new Set<string>(SALES_ORDER_STATUSES);

function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

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

  const status = searchParams.get("status");
  const client = searchParams.get("client")?.trim();
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

  const ORDER_LIST_SELECT = `
    *,
    production_order:production_orders!sales_orders_production_order_id_fkey(
      id,
      status,
      order_number
    )
  `.trim();

  let query = admin
    .from("sales_orders")
    .select(ORDER_LIST_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (status && status !== "all") {
    if (!SO_SET.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (client) {
    const safe = `%${escapeIlike(client)}%`;
    query = query.or(
      `client_name.ilike.${safe},client_document.ilike.${safe},client_email.ilike.${safe},order_number.ilike.${safe}`
    );
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

  const expected_delivery =
    b.expected_delivery === undefined || b.expected_delivery === null
      ? null
      : String(b.expected_delivery).slice(0, 10);

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

  const { error: ePrd } = await ensureProductionOrderForSales(
    admin,
    { tenantId, userId: user.id },
    {
      id: row.id,
      order_number: row.order_number,
      client_name: row.client_name,
      client_document: row.client_document,
      expected_delivery,
    }
  );
  if (ePrd) {
    await rollbackSalesOrderCreation(admin, tenantId, row.id);
    return apiError("Erro ao gerar ordem de produção: " + ePrd, 500);
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

  const recv = await generateReceivablesForSalesOrder(admin, tenantId, {
    id: fresh.id,
    order_number: fresh.order_number,
    order_date: fresh.order_date,
    total: fresh.total,
    client_name: fresh.client_name,
    client_document: fresh.client_document,
    payment_installments: fresh.payment_installments,
    payment_days_to_first_due: fresh.payment_days_to_first_due,
    payment_days_between_installments: fresh.payment_days_between_installments,
  });

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
