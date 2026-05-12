import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/lib/utils/tenant";
import { workCenterSchema } from "@/lib/schemas/product.schema";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type WorkCenterRow = Database["public"]["Tables"]["work_centers"]["Row"];

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
    .from("work_centers")
    .select(
      "id, tenant_id, code, name, hourly_cost, efficiency, description, is_active, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar centros de trabalho: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: (data ?? []) as WorkCenterRow[] });
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

  const parsed = workCenterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const v = parsed.data;

  const { data, error } = await admin
    .from("work_centers")
    .insert({
      tenant_id: tenantId,
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      hourly_cost: v.hourly_cost,
      efficiency: v.efficiency,
      description: v.description ?? null,
      is_active: v.is_active,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError(
      `Já existe um centro de trabalho com o código "${v.code}".`,
      409
    );
  }
  if (error) {
    return apiError(
      "Erro ao criar centro de trabalho: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
