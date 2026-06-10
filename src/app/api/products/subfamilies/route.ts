import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  normalizeClassificationCatalogCode,
  validateClassificationCatalogCode,
} from "@/modules/engenharia/lib/products/classification-catalog-codes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireAnyMenuModule(["engenharia", "vendas"]);
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const familyId = request.nextUrl.searchParams.get("family_id")?.trim();
  if (!familyId || !/^[0-9a-f-]{36}$/i.test(familyId)) {
    return apiOk({ data: [] });
  }

  const admin = createSupabaseAdminClient();
  const { data: famOk } = await admin
    .from("product_families")
    .select("id")
    .eq("id", familyId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!famOk) {
    return apiOk({ data: [] });
  }

  const { data, error } = await admin
    .from("product_subfamilies")
    .select("id,family_id,code,name,sort_order")
    .eq("tenant_id", tenantId)
    .eq("family_id", familyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar sub-famílias: " + error.message,
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

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const familyId =
    typeof b.family_id === "string" ? b.family_id.trim() : "";
  const rawCode =
    typeof b.code === "string"
      ? normalizeClassificationCatalogCode(b.code)
      : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description =
    typeof b.description === "string" ? b.description.trim() || null : null;

  if (!familyId) return apiError("family_id é obrigatório", 400);
  const codeErr = validateClassificationCatalogCode(rawCode);
  if (codeErr) return apiError(codeErr, 400);
  if (!name) return apiError("Nome da sub-família é obrigatório", 400);

  const admin = createSupabaseAdminClient();
  const { data: family } = await admin
    .from("product_families")
    .select("id,code,name")
    .eq("id", familyId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!family) {
    return apiError("Família inválida ou inactiva para este tenant.", 400);
  }

  const { data: maxRow } = await admin
    .from("product_subfamilies")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .eq("family_id", familyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("product_subfamilies")
    .insert({
      tenant_id: tenantId,
      family_id: familyId,
      code: rawCode,
      name,
      description,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
      is_active: true,
    })
    .select("id,family_id,code,name,sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(
        `Já existe uma sub-família com o código «${rawCode}» nesta família.`,
        409
      );
    }
    return apiError(
      "Erro ao criar sub-família: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data });
}
