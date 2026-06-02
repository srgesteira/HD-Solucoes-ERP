import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  normalizeClassificationCatalogCode,
  validateClassificationCatalogCode,
} from "@/modules/engenharia/lib/products/classification-catalog-codes";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireAnyMenuModule(["engenharia", "vendas"]);
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("product_materials")
    .select("id,code,name,sort_order")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar materiais: " + error.message,
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
  const moduleDenied = await requireAnyMenuModule(["engenharia", "vendas"]);
  if (moduleDenied) return moduleDenied;
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError(
      "Sem permissão para cadastrar materiais. Contacte um administrador.",
      403
    );
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawCode =
    typeof b.code === "string"
      ? normalizeClassificationCatalogCode(b.code)
      : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description =
    typeof b.description === "string" ? b.description.trim() || null : null;

  const codeErr = validateClassificationCatalogCode(rawCode);
  if (codeErr) return apiError(codeErr, 400);
  if (!name) return apiError("Nome do material é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const { data: maxRow } = await admin
    .from("product_materials")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("product_materials")
    .insert({
      tenant_id: tenantId,
      code: rawCode,
      name,
      description,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
      is_active: true,
    })
    .select("id,code,name,sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(
        `Já existe um material com o código «${rawCode}» nesta empresa.`,
        409
      );
    }
    return apiError(
      "Erro ao criar material: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data });
}
