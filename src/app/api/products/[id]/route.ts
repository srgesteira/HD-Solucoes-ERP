import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { productSchema } from "@/shared/contracts/product.schema";
import {
  assertProductClassificationTenant,
  assertSimplifiedProductClassificationTenant,
} from "@/modules/engenharia/lib/products/classification-validation";
import {
  isCompleteClassificationSuffix,
  isMoClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/modules/engenharia/lib/products/prefix-classification";
import { productTypeFromPrefixCode } from "@/modules/engenharia/lib/products/product-type-from-prefix";
import { recordProductPriceHistory } from "@/modules/engenharia/lib/products/product-price-history";
import { propagateComponentCostChange } from "@/modules/engenharia/lib/products/propagate-component-cost";
import { roundBomCost } from "@/modules/engenharia/lib/products/bom-unit-cost-sync";
import { seUsesBomCalculatedCost } from "@/modules/engenharia/lib/products/product-bom-eligibility";
import { resolveMoProductCostPrice } from "@/modules/engenharia/lib/products/mo-cost-price";
import { productNatureFromPrefixCode } from "@/modules/engenharia/lib/products/mrp-product-nature";
import {
  PRODUCT_HARD_DELETE_BLOCKED_MESSAGE,
  hardDeleteProduct,
} from "@/modules/engenharia/lib/products/delete-product";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PRODUCT_COMPONENT_SELECT =
  `
  *,
  component_product:products!product_components_component_product_id_fkey(
    *,
    prefix:product_prefixes!products_prefix_id_fkey(id,code)
  ),
  work_center:work_centers(*)
`.trim();

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
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: existingProduct, error: loadErr } = await admin
    .from("products")
    .select(
      "id,code,technical_code,cost_price,has_composition,prefix_id,family_id,subfamily_id,material_id,finish_id,default_is_external_labor,default_labor_cost,default_work_center_id,default_production_line_id"
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

  const technicalCodeLocked =
    String(existingProduct.technical_code ?? "").trim().length > 0;

  const classificationFieldKeys = [
    "prefix_id",
    "family_id",
    "subfamily_id",
    "material_id",
    "finish_id",
  ] as const;

  if (technicalCodeLocked) {
    for (const key of classificationFieldKeys) {
      if (validated[key] === undefined) continue;
      const next = validated[key];
      const prev = existingProduct[key as keyof typeof existingProduct];
      const same =
        next === prev ||
        (next != null &&
          prev != null &&
          String(next).trim() === String(prev).trim());
      if (!same) {
        return apiError(
          "Código técnico já gerado. Não é permitido alterar sufixo/prefixo, família, subfamília, material ou acabamento. Crie um novo produto.",
          400
        );
      }
    }
  }

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
  if (validated.cost_price !== undefined) {
    updateRow.cost_price = validated.cost_price;
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
  if (validated.default_is_external_labor !== undefined) {
    updateRow.default_is_external_labor = validated.default_is_external_labor;
  }
  if (validated.default_work_center_id !== undefined) {
    updateRow.default_work_center_id = validated.default_work_center_id;
  }
  if (validated.default_production_line_id !== undefined) {
    updateRow.default_production_line_id = validated.default_production_line_id;
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

  let mergedPrefixCode = "";
  if (mergedPrefix) {
    const { data: prefixRow } = await admin
      .from("product_prefixes")
      .select("code")
      .eq("id", mergedPrefix)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    mergedPrefixCode = prefixRow?.code ?? "";
  }
  const mergedIsMo = isMoClassificationSuffix(mergedPrefixCode);
  const mergedIsComplete = isCompleteClassificationSuffix(mergedPrefixCode);
  const mergedIsSimplified = isSimplifiedClassificationSuffix(mergedPrefixCode);

  if (mergedIsSimplified && mergedPrefix && mergedMat && mergedFinish) {
    const classErr = await assertSimplifiedProductClassificationTenant(
      admin,
      tenantId,
      {
        prefix_id: mergedPrefix,
        material_id: mergedMat,
        finish_id: mergedFinish,
      }
    );
    if (classErr) {
      return apiError(classErr, 400);
    }
  } else if (
    mergedIsComplete &&
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

  if (!mergedIsMo) {
    if (
      validated.prefix_id !== undefined ||
      validated.default_is_external_labor !== undefined ||
      validated.default_work_center_id !== undefined ||
      validated.default_labor_cost !== undefined
    ) {
      updateRow.default_is_external_labor = false;
      updateRow.default_work_center_id = null;
      updateRow.default_labor_cost = null;
    }
  } else {
    const ext =
      updateRow.default_is_external_labor !== undefined
        ? Boolean(updateRow.default_is_external_labor)
        : Boolean(existingProduct.default_is_external_labor);
    updateRow.default_labor_cost = null;
    if (ext) {
      updateRow.default_work_center_id = null;
    } else {
      const dwc =
        updateRow.default_work_center_id !== undefined
          ? updateRow.default_work_center_id
          : existingProduct.default_work_center_id;
      if (
        updateRow.default_is_external_labor !== undefined ||
        updateRow.default_work_center_id !== undefined
      ) {
        if (!dwc) {
          return apiError(
            "Com prefixo MO interna, default_work_center_id é obrigatório.",
            400
          );
        }
      }
      if (updateRow.default_work_center_id) {
        const { count: wcOk } = await admin
          .from("work_centers")
          .select("*", { count: "exact", head: true })
          .eq("id", updateRow.default_work_center_id)
          .eq("tenant_id", tenantId);
        if (!wcOk) {
          return apiError("Centro de trabalho padrão inválido para este tenant.", 400);
        }
      }
    }

    const mergedMoWc = ext
      ? null
      : (updateRow.default_work_center_id !== undefined
          ? updateRow.default_work_center_id
          : existingProduct.default_work_center_id);
    const mergedPlId =
      updateRow.default_production_line_id !== undefined
        ? updateRow.default_production_line_id
        : existingProduct.default_production_line_id;
    const costInput =
      validated.cost_price !== undefined
        ? validated.cost_price
        : existingProduct.cost_price;
    updateRow.cost_price = await resolveMoProductCostPrice(admin, tenantId, {
      cost_price: costInput,
      default_is_external_labor: ext,
      default_work_center_id: mergedMoWc,
      default_production_line_id: mergedPlId,
    });
  }

  if (mergedPrefixCode) {
    updateRow.type = productTypeFromPrefixCode(mergedPrefixCode);
    updateRow.product_nature = productNatureFromPrefixCode(mergedPrefixCode);
  }

  if (technicalCodeLocked) {
    for (const key of classificationFieldKeys) {
      delete updateRow[key];
    }
  }

  if (
    validated.cost_price !== undefined &&
    seUsesBomCalculatedCost(
      mergedPrefixCode,
      Boolean(existingProduct.has_composition)
    )
  ) {
    const nextCost = roundBomCost(Number(validated.cost_price));
    const prevCost = roundBomCost(Number(existingProduct.cost_price ?? 0));
    if (nextCost !== prevCost) {
      return apiError(
        "Semi-elaborado com receita (BOM): o custo é calculado pela composição. Altere a aba Composição.",
        400
      );
    }
    delete updateRow.cost_price;
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

  if (
    validated.cost_price !== undefined &&
    mergedIsSimplified &&
    !seUsesBomCalculatedCost(
      mergedPrefixCode,
      Boolean(existingProduct.has_composition)
    )
  ) {
    const prevCost = Number(existingProduct.cost_price ?? 0);
    const nextCost = Number(validated.cost_price);
    if (Number.isFinite(nextCost) && nextCost >= 0 && nextCost !== prevCost) {
      try {
        await recordProductPriceHistory(admin, tenantId, productId, {
          priceType: "purchase",
          value: nextCost,
          notes: "Custo manual actualizado",
        });
      } catch (histErr) {
        return apiError(
          histErr instanceof Error
            ? histErr.message
            : "Erro ao registar histórico de custo.",
          500
        );
      }
    }
  }

  const prevCostPrice = roundBomCost(Number(existingProduct.cost_price ?? 0));
  const nextCostPrice = roundBomCost(Number(data.cost_price ?? 0));
  if (nextCostPrice !== prevCostPrice) {
    try {
      await propagateComponentCostChange(admin, tenantId, productId);
    } catch (propErr) {
      return apiError(
        propErr instanceof Error
          ? propErr.message
          : "Erro ao propagar custo na estrutura (BOM).",
        500
      );
    }
  }

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
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

  const { data: existing, error: loadErr } = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return apiError(
      "Erro ao carregar produto: " + loadErr.message,
      supabaseErrorToHttp(loadErr.code)
    );
  }
  if (!existing) return apiError("Produto não encontrado", 404);

  try {
    await hardDeleteProduct(admin, tenantId, productId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Não foi possível excluir o produto.";
    if (message === PRODUCT_HARD_DELETE_BLOCKED_MESSAGE) {
      return apiError(message, 400);
    }
    if (message === "Produto não encontrado") {
      return apiError(message, 404);
    }
    return apiError(message, 500);
  }

  return apiOk({ success: true });
}
