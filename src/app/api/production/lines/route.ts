import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type ProductionLineRow =
  Database["public"]["Tables"]["production_lines"]["Row"];

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("production_lines")
    .select("id, code, name, sort_order, is_active, description, work_center_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar linhas de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: (data ?? []) as ProductionLineRow[] });
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
  const sort_order =
    typeof b.sort_order === "number"
      ? b.sort_order
      : parseInt(String(b.sort_order ?? "0"), 10) || 0;
  const description =
    b.description === null || b.description === undefined
      ? null
      : String(b.description);

  if (!code || !name) {
    return apiError("Código e nome são obrigatórios", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("production_lines")
    .insert({
      tenant_id: tenantId,
      code: code.toUpperCase(),
      name,
      sort_order,
      description: description ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError("Já existe uma linha com este código", 409);
  }
  if (error) {
    return apiError(
      "Erro ao criar linha de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
