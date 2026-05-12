import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/lib/utils/tenant";
import { QUOTE_STATUSES } from "@/lib/types/sales.types";
import {
  insertQuoteItemsFromLines,
  nextQuoteNumber,
  parseSaleLines,
} from "@/lib/sales/sales-flow";

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
      `quote_number.ilike.${safe},client_name.ilike.${safe},client_document.ilike.${safe},client_email.ilike.${safe}`
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

  const parsedLines = parseSaleLines(b.items);
  if (!parsedLines.ok) {
    return apiError(parsedLines.message, 400);
  }

  const client_name =
    typeof b.client_name === "string" ? b.client_name.trim() : "";
  if (!client_name) return apiError("Nome do cliente é obrigatório", 400);

  const quote_number =
    typeof b.quote_number === "string" && b.quote_number.trim()
      ? b.quote_number.trim()
      : await nextQuoteNumber(createSupabaseAdminClient(), tenantId);

  const admin = createSupabaseAdminClient();

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

  const quote_date =
    b.quote_date === undefined || b.quote_date === null
      ? new Date().toISOString().slice(0, 10)
      : String(b.quote_date).slice(0, 10);

  const valid_until =
    b.valid_until === undefined || b.valid_until === null
      ? null
      : String(b.valid_until).slice(0, 10);

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

  const notes =
    b.notes === undefined || b.notes === null
      ? null
      : String(b.notes).trim() || null;

  const { data: row, error: insErr } = await admin
    .from("quotes")
    .insert({
      tenant_id: tenantId,
      quote_number,
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
      quote_date,
      valid_until,
      status: "draft",
      notes,
      created_by: profile?.id ?? null,
      ...(discount !== undefined ? { discount } : {}),
      ...(tax !== undefined ? { tax } : {}),
    })
    .select()
    .single();

  if (insErr?.code === "23505") {
    return apiError("Número do orçamento já existe", 409);
  }
  if (insErr) {
    return apiError(
      "Erro ao criar orçamento: " + insErr.message,
      supabaseErrorToHttp(insErr.code)
    );
  }

  const qErr = await insertQuoteItemsFromLines(
    admin,
    tenantId,
    row.id,
    parsedLines.lines
  );
  if (qErr.error) {
    await admin.from("quotes").delete().eq("id", row.id).eq("tenant_id", tenantId);
    return apiError("Erro ao gravar itens: " + qErr.error, 500);
  }

  const { data: full } = await admin
    .from("quotes")
    .select("*")
    .eq("id", row.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return apiOk({ data: full ?? row }, 201);
}
