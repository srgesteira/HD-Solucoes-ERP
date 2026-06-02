import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireAnyMenuModule } from "@/modules/core/lib/api-guards";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

const FAMILY_CODE_RE = /^[A-Z0-9]{1,4}$/;

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
    .from("product_families")
    .select("id,code,name,sort_order")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar famílias: " + error.message,
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
      "Sem permissão para cadastrar famílias. Contacte um administrador.",
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
  const rawCode = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description =
    typeof b.description === "string" ? b.description.trim() || null : null;

  if (!rawCode) return apiError("Código da família é obrigatório", 400);
  if (!FAMILY_CODE_RE.test(rawCode)) {
    return apiError(
      "Código inválido. Use 1 a 4 letras ou números (ex.: A, B, H1).",
      400
    );
  }
  if (!name) return apiError("Nome da família é obrigatório", 400);

  const admin = createSupabaseAdminClient();

  const { data: maxRow } = await admin
    .from("product_families")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await admin
    .from("product_families")
    .insert({
      tenant_id: tenantId,
      code: rawCode,
      name,
      description,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("id,code,name,sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(`Já existe uma família com o código «${rawCode}».`, 409);
    }
    return apiError(
      "Erro ao criar família: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data });
}
