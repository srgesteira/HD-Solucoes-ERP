import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { commercialProductQuickCreateSchema } from "@/shared/contracts/commercial-product.schema";
import {
  assertProductClassificationTenant,
  assertSimplifiedProductClassificationTenant,
  requireCompleteClassificationFields,
  requireSimplifiedClassificationFields,
} from "@/modules/engenharia/lib/products/classification-validation";
import {
  isCompleteClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";
import { productTypeFromPrefixCode } from "@/modules/engenharia/lib/products/product-type-from-prefix";
import { productNatureFromPrefixCode } from "@/modules/engenharia/lib/products/mrp-product-nature";
import { ENGINEERING_STATUS_PENDING } from "@/modules/engenharia/lib/products/engineering-workflow";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = commercialProductQuickCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const validated = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: prefixRow } = await admin
    .from("product_prefixes")
    .select("code")
    .eq("id", validated.prefix_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const prefixCode = prefixRow?.code ?? "";
  const isCompletePrefix = isCompleteClassificationSuffix(prefixCode);
  const isSimplifiedPrefix = isSimplifiedClassificationSuffix(prefixCode);

  if (!isCompletePrefix && !isSimplifiedPrefix) {
    return apiError(
      `Prefixo «${prefixCode || "?"}» não suportado para cadastro comercial.`,
      400
    );
  }

  if (isCompletePrefix) {
    const missingClass = requireCompleteClassificationFields(validated);
    if (missingClass) return apiError(missingClass, 400);
    const classErr = await assertProductClassificationTenant(admin, tenantId, {
      prefix_id: validated.prefix_id,
      family_id: validated.family_id!,
      subfamily_id: validated.subfamily_id!,
      material_id: validated.material_id,
      finish_id: validated.finish_id,
    });
    if (classErr) return apiError(classErr, 400);
  } else {
    const missingSimple = requireSimplifiedClassificationFields(validated);
    if (missingSimple) return apiError(missingSimple, 400);
    const simpleErr = await assertSimplifiedProductClassificationTenant(
      admin,
      tenantId,
      {
        prefix_id: validated.prefix_id,
        material_id: validated.material_id,
        finish_id: validated.finish_id,
      }
    );
    if (simpleErr) return apiError(simpleErr, 400);
  }

  if (validated.source_quote_id) {
    const { data: quoteOk } = await admin
      .from("quotes")
      .select("id")
      .eq("id", validated.source_quote_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!quoteOk) {
      return apiError("Orçamento de origem inválido.", 400);
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("products")
    .insert({
      tenant_id: tenantId,
      code: null,
      technical_code: "",
      name: validated.name.trim(),
      description: validated.description?.trim() || null,
      unit: validated.unit.trim() || "UN",
      type: productTypeFromPrefixCode(prefixCode),
      cost_price: 0,
      selling_price: 0,
      is_active: true,
      prefix_id: validated.prefix_id,
      family_id: isCompletePrefix ? validated.family_id ?? null : null,
      subfamily_id: isCompletePrefix ? validated.subfamily_id ?? null : null,
      material_id: validated.material_id,
      finish_id: validated.finish_id,
      product_nature: productNatureFromPrefixCode(prefixCode),
      engineering_workflow_status: ENGINEERING_STATUS_PENDING,
      composition_requested_at: now,
      released_for_sale: false,
      released_for_sale_at: null,
      source_quote_id: validated.source_quote_id ?? null,
      has_composition: false,
    })
    .select(
      "id,name,technical_code,code,unit,cost_price,prefix_id,engineering_workflow_status,released_for_sale"
    )
    .single();

  if (error) {
    return apiError(
      "Erro ao criar produto: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
