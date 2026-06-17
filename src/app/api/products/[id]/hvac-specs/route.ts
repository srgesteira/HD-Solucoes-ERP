import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { hvacProductSpecsSchema } from "@/shared/contracts/hvac-product.schema";
import { isHvacSpecProduct } from "@/modules/hvac/lib/hvac-domain";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(
      `
      id,
      product_nature,
      hvac_filter_class,
      hvac_airflow_m3h,
      hvac_pressure_drop_pa,
      hvac_cleanroom_class,
      hvac_requires_integrity_test,
      hvac_integrity_test_method,
      prefix:product_prefixes(code)
    `
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return apiError(error.message, supabaseErrorToHttp(error.code));
  if (!data) return apiError("Produto não encontrado", 404);

  const prefixRaw = data.prefix as
    | { code?: string }
    | { code?: string }[]
    | null;
  const prefix = Array.isArray(prefixRaw) ? prefixRaw[0] : prefixRaw;

  return apiOk({
    specs: {
      hvac_filter_class: data.hvac_filter_class,
      hvac_airflow_m3h: data.hvac_airflow_m3h,
      hvac_pressure_drop_pa: data.hvac_pressure_drop_pa,
      hvac_cleanroom_class: data.hvac_cleanroom_class,
      hvac_requires_integrity_test: data.hvac_requires_integrity_test ?? false,
      hvac_integrity_test_method: data.hvac_integrity_test_method,
    },
    applicable: isHvacSpecProduct({
      product_nature: data.product_nature,
      prefix_code: prefix?.code ?? null,
    }),
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = hvacProductSpecsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Dados inválidos", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: product, error: loadErr } = await admin
    .from("products")
    .select("id, product_nature, prefix:product_prefixes(code)")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) return apiError(loadErr.message, supabaseErrorToHttp(loadErr.code));
  if (!product) return apiError("Produto não encontrado", 404);

  const prefixRaw = product.prefix as
    | { code?: string }
    | { code?: string }[]
    | null;
  const prefix = Array.isArray(prefixRaw) ? prefixRaw[0] : prefixRaw;

  if (
    !isHvacSpecProduct({
      product_nature: product.product_nature,
      prefix_code: prefix?.code ?? null,
    })
  ) {
    return apiError(
      "Especificações HVAC aplicam-se a produtos acabados (AC / HD1–HD3).",
      400
    );
  }

  const b = parsed.data;
  const { error: updErr } = await admin
    .from("products")
    .update({
      hvac_filter_class: b.hvac_filter_class?.trim() || null,
      hvac_airflow_m3h: b.hvac_airflow_m3h ?? null,
      hvac_pressure_drop_pa: b.hvac_pressure_drop_pa ?? null,
      hvac_cleanroom_class: b.hvac_cleanroom_class?.trim() || null,
      hvac_requires_integrity_test: b.hvac_requires_integrity_test ?? false,
      hvac_integrity_test_method: b.hvac_integrity_test_method?.trim() || null,
    })
    .eq("id", productId)
    .eq("tenant_id", tenantId);

  if (updErr) return apiError(updErr.message, supabaseErrorToHttp(updErr.code));

  return apiOk({ success: true });
}
