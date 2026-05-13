import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { productSchema } from "@/lib/schemas/product.schema";
import { assertProductClassificationTenant } from "@/lib/products/classification-validation";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PRODUCT_COMPONENT_SELECT =
  `
  *,
  component_product:products!product_components_component_product_id_fkey(*),
  work_center:work_centers(*)
`.trim();

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  const { data: product, error: productError } = await admin
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (productError) {
    return apiError("Erro ao buscar produto: " + productError.message, 500);
  }
  if (!product) {
    return apiError("Produto não encontrado", 404);
  }

  const { data: components, error: componentsError } = await admin
    .from("product_components")
    .select(PRODUCT_COMPONENT_SELECT)
    .eq("parent_product_id", productId)
    .eq("tenant_id", tenantId);

  if (componentsError) {
    return apiError(
      "Erro ao buscar componentes: " + componentsError.message,
      500
    );
  }

  return apiOk({
    data: {
      ...product,
      components: components ?? [],
    },
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

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

  const admin = createSupabaseAdminClient();
  const { data: existingProduct, error: loadErr } = await admin
    .from("products")
    .select(
      "id,code,prefix_id,family_id,subfamily_id,material_id,finish_id"
    )
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar produto: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }
  if (!existingProduct) {
    return apiError("Produto não encontrado", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = productSchema.partial().safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const validated = parsed.data as Partial<
    Database["public"]["Tables"]["products"]["Update"]
  >;

  const updateRow: Database["public"]["Tables"]["products"]["Update"] = {};
  if (validated.name !== undefined) updateRow.name = validated.name;
  if (validated.description !== undefined) {
    updateRow.description = validated.description;
  }
  if (validated.technical_description !== undefined) {
    updateRow.technical_description = validated.technical_description;
  }
  if (validated.ncm !== undefined) updateRow.ncm = validated.ncm;
  if (validated.unit !== undefined) updateRow.unit = validated.unit ?? null;
  if (validated.type !== undefined)
    updateRow.type =
      validated.type as Database["public"]["Tables"]["products"]["Row"]["type"];
  if (validated.cost_price !== undefined) {
    updateRow.cost_price = validated.cost_price;
  }
  if (validated.selling_price !== undefined) {
    updateRow.selling_price = validated.selling_price;
  }
  if (validated.is_active !== undefined) updateRow.is_active = validated.is_active;
  if (validated.use_custom_bdi !== undefined) {
    updateRow.use_custom_bdi = validated.use_custom_bdi;
  }
  if (validated.custom_tax_rate !== undefined) {
    updateRow.custom_tax_rate = validated.custom_tax_rate;
  }
  if (validated.custom_profit_margin !== undefined) {
    updateRow.custom_profit_margin = validated.custom_profit_margin;
  }
  if (validated.prefix_id !== undefined) {
    updateRow.prefix_id = validated.prefix_id;
  }
  if (validated.family_id !== undefined) {
    updateRow.family_id = validated.family_id;
  }
  if (validated.subfamily_id !== undefined) {
    updateRow.subfamily_id = validated.subfamily_id;
  }
  if (validated.material_id !== undefined) {
    updateRow.material_id = validated.material_id;
  }
  if (validated.finish_id !== undefined) {
    updateRow.finish_id = validated.finish_id;
  }
  if (validated.product_nature !== undefined) {
    updateRow.product_nature = validated.product_nature;
  }

  const mergedPrefix =
    validated.prefix_id !== undefined
      ? validated.prefix_id
      : existingProduct.prefix_id;
  const mergedFamily =
    validated.family_id !== undefined
      ? validated.family_id
      : existingProduct.family_id;
  const mergedSub =
    validated.subfamily_id !== undefined
      ? validated.subfamily_id
      : existingProduct.subfamily_id;
  const mergedMat =
    validated.material_id !== undefined
      ? validated.material_id
      : existingProduct.material_id;
  const mergedFinish =
    validated.finish_id !== undefined
      ? validated.finish_id
      : existingProduct.finish_id;

  if (
    mergedPrefix &&
    mergedFamily &&
    mergedSub &&
    mergedMat &&
    mergedFinish
  ) {
    const classErr = await assertProductClassificationTenant(admin, tenantId, {
      prefix_id: mergedPrefix,
      family_id: mergedFamily,
      subfamily_id: mergedSub,
      material_id: mergedMat,
      finish_id: mergedFinish,
    });
    if (classErr) {
      return apiError(classErr, 400);
    }
  }

  if (Object.keys(updateRow).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const { data, error } = await admin
    .from("products")
    .update(updateRow)
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError(
      "Já existe um produto com este código técnico no tenant.",
      409
    );
  }
  if (error) {
    return apiError(
      "Erro ao atualizar produto: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Produto não encontrado", 404);

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

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

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("products")
    .update({
      is_active: false,
    })
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao remover produto: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!updated) return apiError("Produto não encontrado", 404);

  return apiOk({ success: true });
}
