import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type ProductionOrderRow =
  Database["public"]["Tables"]["production_orders"]["Row"];

/** Escapa `%` e `_` para filtros `.ilike` dentro de `.or()` */
function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const ORDER_STATUSES = new Set([
  "imported",
  "planning",
  "in_production",
  "ready",
  "finished",
  "delayed",
  "cancelled",
]);

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
  const search = searchParams.get("search")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10) || 25)
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("production_orders")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (status && status !== "all") {
    if (!ORDER_STATUSES.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (search) {
    const condensed = search.replace(/,/g, " ").trim();
    const safe = `%${escapeIlike(condensed)}%`;
    query = query.or(`order_number.ilike.${safe},client_name.ilike.${safe}`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar pedidos de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: (data ?? []) as ProductionOrderRow[],
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

  const order_number =
    typeof b.order_number === "string" ? b.order_number.trim() : "";
  const client_name =
    b.client_name === null || b.client_name === undefined
      ? null
      : typeof b.client_name === "string"
        ? b.client_name.trim() || null
        : String(b.client_name);
  const client_document =
    b.client_document === null || b.client_document === undefined
      ? null
      : typeof b.client_document === "string"
        ? b.client_document.trim() || null
        : String(b.client_document);
  const description =
    b.description === null || b.description === undefined
      ? null
      : String(b.description);

  const delivery_deadline =
    b.delivery_deadline === null || b.delivery_deadline === undefined
      ? null
      : String(b.delivery_deadline).slice(0, 10);
  const pcp_deadline =
    b.pcp_deadline === null || b.pcp_deadline === undefined
      ? null
      : String(b.pcp_deadline).slice(0, 10);
  const notes =
    b.notes === null || b.notes === undefined ? null : String(b.notes);

  if (!order_number) {
    return apiError("Número do pedido é obrigatório", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("production_orders")
    .insert({
      tenant_id: tenantId,
      order_number,
      client_name,
      client_document,
      description,
      delivery_deadline,
      pcp_deadline,
      notes,
      status: "imported",
      created_by: user.id,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError(
      `Já existe um pedido com o número "${order_number}".`,
      409
    );
  }
  if (error) {
    return apiError(
      "Erro ao criar pedido de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
