import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { z } from "zod";

export const dynamic = "force-dynamic";

const departmentSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(32),
  is_support: z.boolean().optional().default(true),
});

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
    .from("departments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar departamentos: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = departmentSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const v = parsed.data;
  const { data, error } = await admin
    .from("departments")
    .insert({
      tenant_id: tenantId,
      name: v.name.trim(),
      code: v.code.trim().toUpperCase(),
      is_support: v.is_support,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError("Código de departamento já existe", 409);
  }
  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ data }, 201);
}
