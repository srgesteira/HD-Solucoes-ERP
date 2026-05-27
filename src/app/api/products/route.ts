import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/lib/utils/tenant";
import {
  canViewProductPrefixCode,
  finishedProductPrefixCodes,
} from "@/lib/products/product-prefix-access";
import {
  productCreateSchema,
} from "@/lib/schemas/product.schema";
import {
  assertProductClassificationTenant,
  assertSimplifiedProductClassificationTenant,
  requireCompleteClassificationFields,
  requireSimplifiedClassificationFields,
} from "@/lib/products/classification-validation";
import {
  isCompleteClassificationSuffix,
  isMoClassificationSuffix,
  isSimplifiedClassificationSuffix,
} from "@/lib/products/prefix-classification";
import { productTypeFromPrefixCode } from "@/lib/products/product-type-from-prefix";
import { recordProductPriceHistory } from "@/lib/products/product-price-history";
import { resolveMoProductCostPrice } from "@/lib/products/mo-cost-price";
import { productNatureFromPrefixCode } from "@/lib/products/mrp-product-nature";

export const dynamic = "force-dynamic";

/** Escapa % e _ para usar em filtros `.ilike` dentro de `.or()`. */
function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const isAdmin = await isCurrentUserTenantAdmin();
  const params = request.nextUrl.searchParams;

  const type = params.get("type");
  const isActive = params.get("is_active");
  const search = params.get("search")?.trim();
  const prefixCode = params.get("prefix_code")?.trim().toUpperCase() ?? "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "25", 10) || 25));
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  const productListSelect =
    "*, prefix:product_prefixes!products_prefix_id_fkey(code)";

  if (prefixCode && !canViewProductPrefixCode(prefixCode, isAdmin)) {
    return apiError("Sem permissão para este prefixo", 403);
  }

  let allowedPrefixIds: string[] | null = null;
  if (!isAdmin) {
    const { data: allowedPrefixes, error: prefixErr } = await admin
      .from("product_prefixes")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("code", [...finishedProductPrefixCodes()]);
    if (prefixErr) {
      return apiError(
        "Erro ao validar prefixos: " + prefixErr.message,
        500
      );
    }
    allowedPrefixIds = (allowedPrefixes ?? []).map((p) => p.id);
  }

  let prefixIdFilter: string | null = null;
  if (prefixCode) {
    const { data: prefixRow, error: prefixLookupErr } = await admin
      .from("product_prefixes")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", prefixCode)
      .maybeSingle();
    if (prefixLookupErr) {
      return apiError(
        "Erro ao filtrar prefixo: " + prefixLookupErr.message,
        500
      );
    }
    if (!prefixRow) {
      return apiOk({
        data: [],
        pagination: { page, limit, total: 0 },
      });
    }
    prefixIdFilter = prefixRow.id;
  }

  let q = admin
    .from("products")
    .select(productListSelect, { count: "exact" })
    .eq("tenant_id", tenantId);

  if (!isAdmin && allowedPrefixIds) {
    if (allowedPrefixIds.length === 0) {
      return apiOk({
        data: [],
        pagination: { page, limit, total: 0 },
      });
    }
    q = q.in("prefix_id", allowedPrefixIds);
  }
  if (prefixIdFilter) {
    q = q.eq("prefix_id", prefixIdFilter);
  }

  /** Ex.: `type=finished` → apenas acabados (HD1, HD2, HD3, AC). */
  if (type && type !== "all") {
    q = q.eq("type", type);
  }
  if (isActive !== null && isActive !== "") {
    q = q.eq("is_active", isActive === "true");
  }
  if (search) {
    const condensed = search.replace(/,/g, " ").trim();
    const safe = `%${escapeIlike(condensed)}%`;
    q = q.or(`name.ilike.${safe},technical_code.ilike.${safe},code.ilike.${safe}`);
  }

  q = q.order("technical_code", { ascending: true }).range(start, end);

  const { data, error, count } = await q;

  if (error) return apiError("Erro ao buscar produtos: " + error.message, 500);

  return apiOk({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  });
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

  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const validated = parsed.data;

  const { data: prefixRow } = await admin
    .from("product_prefixes")
    .select("code")
    .eq("id", validated.prefix_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const prefixCode = prefixRow?.code ?? "";
  const isMoPrefix = isMoClassificationSuffix(prefixCode);
  const isCompletePrefix = isCompleteClassificationSuffix(prefixCode);
  const isSimplifiedPrefix = isSimplifiedClassificationSuffix(prefixCode);

  if (!isCompletePrefix && !isSimplifiedPrefix) {
    return apiError(
      `Prefixo «${prefixCode || "?"}» não suportado. Use HD1–HD3/AC (completo) ou MP/SE/EB/MC/RV/MO (simplificado).`,
      400
    );
  }

  if (isCompletePrefix) {
    const missingClass = requireCompleteClassificationFields(validated);
    if (missingClass) {
      return apiError(missingClass, 400);
    }
    const classErr = await assertProductClassificationTenant(admin, tenantId, {
      prefix_id: validated.prefix_id,
      family_id: validated.family_id!,
      subfamily_id: validated.subfamily_id!,
      material_id: validated.material_id!,
      finish_id: validated.finish_id!,
    });
    if (classErr) {
      return apiError(classErr, 400);
    }
  } else {
    const missingSimple = requireSimplifiedClassificationFields(validated);
    if (missingSimple) {
      return apiError(missingSimple, 400);
    }
    const simpleErr = await assertSimplifiedProductClassificationTenant(
      admin,
      tenantId,
      {
        prefix_id: validated.prefix_id,
        material_id: validated.material_id!,
        finish_id: validated.finish_id!,
      }
    );
    if (simpleErr) {
      return apiError(simpleErr, 400);
    }
  }

  let moExternal = false;
  let moDefaultWc: string | null = null;
  let resolvedCost = Number(validated.cost_price ?? 0);

  if (isMoPrefix) {
    moExternal = Boolean(validated.default_is_external_labor);
    if (!moExternal) {
      if (!validated.default_work_center_id) {
        return apiError(
          "Com prefixo MO interna, o centro de trabalho padrão é obrigatório.",
          400
        );
      }
      const { count: wcOk } = await admin
        .from("work_centers")
        .select("*", { count: "exact", head: true })
        .eq("id", validated.default_work_center_id)
        .eq("tenant_id", tenantId);
      if (!wcOk) {
        return apiError("Centro de trabalho padrão inválido para este tenant.", 400);
      }
      moDefaultWc = validated.default_work_center_id;
    } else {
      moDefaultWc = null;
    }
    resolvedCost = await resolveMoProductCostPrice(admin, tenantId, {
      cost_price: validated.cost_price,
      default_is_external_labor: moExternal,
      default_work_center_id: moDefaultWc,
      default_production_line_id:
        validated.default_production_line_id?.trim() || null,
    });
  }

  const { data, error } = await admin
    .from("products")
    .insert({
      tenant_id: tenantId,
      code: null,
      technical_code: "",
      name: validated.name.trim(),
      description: validated.description ?? null,
      technical_description: validated.technical_description ?? null,
      ncm: validated.ncm ?? null,
      unit: validated.unit.trim(),
      type: productTypeFromPrefixCode(prefixCode),
      cost_price: resolvedCost,
      selling_price: 0,
      is_active: validated.is_active,
      use_custom_bdi: validated.use_custom_bdi ?? false,
      custom_tax_rate:
        validated.custom_tax_rate !== undefined
          ? validated.custom_tax_rate
          : null,
      custom_profit_margin:
        validated.custom_profit_margin !== undefined
          ? validated.custom_profit_margin
          : null,
      prefix_id: validated.prefix_id,
      family_id: isCompletePrefix ? validated.family_id ?? null : null,
      subfamily_id: isCompletePrefix ? validated.subfamily_id ?? null : null,
      material_id: validated.material_id ?? null,
      finish_id: validated.finish_id ?? null,
      product_nature: productNatureFromPrefixCode(prefixCode),
      default_is_external_labor: isMoPrefix ? moExternal : false,
      default_work_center_id: isMoPrefix && !moExternal ? moDefaultWc : null,
      default_labor_cost: null,
      default_production_line_id:
        validated.default_production_line_id?.trim() || null,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError(
      "Já existe um produto com este código técnico no tenant.",
      409
    );
  }
  if (error) {
    return apiError(
      "Erro ao criar produto: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const initialCost = resolvedCost;
  if (data?.id && initialCost > 0 && isSimplifiedPrefix) {
    try {
      await recordProductPriceHistory(admin, tenantId, data.id, {
        priceType: "purchase",
        value: initialCost,
        notes: "Custo manual no cadastro",
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

  return apiOk({ data }, 201);
}
