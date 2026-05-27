import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];
type SupplierInsert = Database["public"]["Tables"]["suppliers"]["Insert"];

/** Escapa `%` e `_` para filtros `.ilike` dentro de `.or()`. */
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
  const search = searchParams.get("search")?.trim();
  const isActive = searchParams.get("is_active");
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
    .from("suppliers")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (search) {
    const condensed = search.replace(/,/g, " ").trim();
    const safe = `%${escapeIlike(condensed)}%`;
    query = query.or(
      `code.ilike.${safe},name.ilike.${safe},document.ilike.${safe},email.ilike.${safe},phone.ilike.${safe}`
    );
  }

  if (isActive !== null && isActive !== "" && isActive !== "all") {
    query = query.eq("is_active", isActive === "true");
  }

  const { data, error, count } = await query
    .order("code", { ascending: true })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar fornecedores: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: (data ?? []) as SupplierRow[],
    pagination: { page, limit, total: count ?? 0 },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

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

  const code = typeof b.code === "string" ? b.code.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";

  if (!code || !name) {
    return apiError("Código e nome são obrigatórios", 400);
  }

  const insertRow: SupplierInsert = {
    tenant_id: tenantId,
    code: code.toUpperCase(),
    name,
    legal_name:
      b.legal_name == null ? null : String(b.legal_name).trim() || null,
    document:
      b.document == null ? null : String(b.document).trim() || null,
    email: b.email == null ? null : String(b.email).trim() || null,
    phone: b.phone == null ? null : String(b.phone).trim() || null,
    website:
      b.website == null ? null : String(b.website).trim() || null,
    address_street:
      b.address_street == null
        ? null
        : String(b.address_street).trim() || null,
    address_number:
      b.address_number == null
        ? null
        : String(b.address_number).trim() || null,
    address_complement:
      b.address_complement == null
        ? null
        : String(b.address_complement).trim() || null,
    address_neighborhood:
      b.address_neighborhood == null
        ? null
        : String(b.address_neighborhood).trim() || null,
    address_city:
      b.address_city == null ? null : String(b.address_city).trim() || null,
    address_state:
      b.address_state == null ? null : String(b.address_state).trim() || null,
    address_zip:
      b.address_zip == null ? null : String(b.address_zip).trim() || null,
    contact_person:
      b.contact_person == null
        ? null
        : String(b.contact_person).trim() || null,
    payment_terms:
      b.payment_terms == null
        ? null
        : String(b.payment_terms).trim() || null,
    delivery_terms:
      b.delivery_terms == null
        ? null
        : String(b.delivery_terms).trim() || null,
    notes: b.notes == null ? null : String(b.notes).trim() || null,
  };

  if (typeof b.is_active === "boolean") {
    insertRow.is_active = b.is_active;
  } else if (b.is_active === "true") {
    insertRow.is_active = true;
  } else if (b.is_active === "false") {
    insertRow.is_active = false;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("suppliers")
    .insert(insertRow)
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError("Código já existe", 409);
  }
  if (error) {
    return apiError(
      "Erro ao criar fornecedor: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
