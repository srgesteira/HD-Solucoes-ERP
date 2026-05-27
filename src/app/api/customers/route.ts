import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertModuleAccess } from "@/modules/core/lib/module-access";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];

function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const access = await assertModuleAccess("sales");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim();
  const isActive = params.get("is_active");
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(params.get("limit") ?? "50", 10) || 50)
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let q = admin
    .from("customers")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (isActive !== null && isActive !== "" && isActive !== "all") {
    q = q.eq("is_active", isActive === "true");
  }

  if (search) {
    const safe = `%${escapeIlike(search)}%`;
    q = q.or(`name.ilike.${safe},document.ilike.${safe},email.ilike.${safe}`);
  }

  const { data, error, count } = await q
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar clientes: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  });
}

export async function POST(request: NextRequest) {
  const access = await assertModuleAccess("sales");
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

  console.log("[POST /api/customers] body recebido", {
    name: b.name,
    document: b.document,
    email: b.email,
    phone: b.phone,
    address: b.address,
    tenantId,
  });

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return apiError("Nome do cliente é obrigatório", 400);

  const insertRow: CustomerInsert = {
    tenant_id: tenantId,
    name,
    document:
      b.document == null || b.document === ""
        ? null
        : String(b.document).trim() || null,
    email:
      b.email == null || b.email === ""
        ? null
        : String(b.email).trim() || null,
    phone:
      b.phone == null || b.phone === ""
        ? null
        : String(b.phone).trim() || null,
    address:
      b.address == null || b.address === ""
        ? null
        : String(b.address).trim() || null,
    is_active: b.is_active === undefined ? true : Boolean(b.is_active),
  };

  if (b.notes != null && String(b.notes).trim()) {
    insertRow.notes = String(b.notes).trim();
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .insert(insertRow)
    .select()
    .single();

  if (error?.code === "23505") {
    console.error("[POST /api/customers] nome duplicado", { name, tenantId });
    return apiError("Já existe um cliente com este nome.", 409);
  }
  if (error) {
    console.error("[POST /api/customers] erro insert", error);
    return apiError(
      "Erro ao criar cliente: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  console.log("[POST /api/customers] cliente criado", {
    id: data?.id,
    name: data?.name,
    tenant_id: data?.tenant_id,
  });

  return apiOk({ data }, 201);
}
