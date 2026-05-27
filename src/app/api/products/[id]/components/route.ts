import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { productComponentSchema } from "@/shared/contracts/product.schema";
import { resolveLaborHourlyRateForBom } from "@/modules/rh/lib/labor-cost-utils";
import type { Database } from "@/modules/core/types/database";
import { recordProductPriceHistory } from "@/modules/engenharia/lib/products/product-price-history";

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
  const { id: parentId } = await params;

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

  const { count } = await admin
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("id", parentId)
    .eq("tenant_id", tenantId);

  if (!count) {
    return apiError("Produto não encontrado", 404);
  }

  const { data, error } = await admin
    .from("product_components")
    .select(PRODUCT_COMPONENT_SELECT)
    .eq("parent_product_id", parentId)
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError(
      "Erro ao buscar componentes: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: parentId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

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

  const parsed = productComponentSchema.safeParse({
    ...(body as Record<string, unknown>),
    parent_product_id: parentId,
  });
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const validated = parsed.data;

  const admin = createSupabaseAdminClient();

  const { count: parentOk } = await admin
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("id", parentId)
    .eq("tenant_id", tenantId);
  if (!parentOk) return apiError("Produto pai não encontrado", 404);

  const externalLabor =
    validated.is_labor &&
    !validated.component_product_id &&
    validated.is_external_labor === true;

  const moCatalogLine =
    validated.is_labor === true && !!validated.component_product_id;

  if (!validated.is_labor && validated.component_product_id) {
    const { data: matComp, error: mErr } = await admin
      .from("products")
      .select("prefix:product_prefixes!products_prefix_id_fkey(code)")
      .eq("id", validated.component_product_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (mErr || !matComp) {
      return apiError("Produto componente não encontrado", 404);
    }
    const p = (matComp.prefix as { code?: string } | null)?.code;
    if (p === "MO") {
      return apiError(
        "Produtos com prefixo MO devem ser adicionados como mão-de-obra (seleccione o produto com o tipo Mão-de-obra).",
        400
      );
    }
  }

  if (validated.is_labor && !moCatalogLine && !externalLabor) {
    if (!validated.work_center_id) {
      return apiError("Centro de trabalho é obrigatório para mão de obra interna", 400);
    }
    const { count: wcOk } = await admin
      .from("work_centers")
      .select("*", { count: "exact", head: true })
      .eq("id", validated.work_center_id)
      .eq("tenant_id", tenantId);
    if (!wcOk) return apiError("Centro de trabalho inválido", 400);
  }

  if (externalLabor && validated.work_center_id) {
    return apiError("Mão de obra externa não deve incluir centro de trabalho", 400);
  }

  let unitCost = 0;
  let workCenterIdIns: string | null = null;
  let componentProductIdIns: string | null = null;
  let isLaborIns = false;
  let lineExternalLaborIns = false;

  if (moCatalogLine) {
    const { data: compRow, error: crErr } = await admin
      .from("products")
      .select(
        "cost_price, default_is_external_labor, default_labor_cost, default_work_center_id, default_production_line_id, prefix:product_prefixes!products_prefix_id_fkey(code)"
      )
      .eq("id", validated.component_product_id!)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (crErr || !compRow) {
      return apiError("Produto componente não encontrado", 404);
    }
    const prefixObj = compRow.prefix as { code?: string } | null;
    if (prefixObj?.code !== "MO") {
      return apiError("Apenas produtos com prefixo MO podem ser linhas mão-de-obra com produto associado.", 400);
    }

    const lineExternal = validated.is_external_labor === true;
    isLaborIns = true;
    lineExternalLaborIns = lineExternal;
    componentProductIdIns = validated.component_product_id!;

    const catalogCost = Number(compRow.cost_price ?? 0);

    if (lineExternal) {
      unitCost =
        validated.unit_cost !== undefined && validated.unit_cost !== null
          ? Number(validated.unit_cost)
          : catalogCost;
      workCenterIdIns = null;
    } else {
      const wcUse =
        validated.work_center_id ?? compRow.default_work_center_id ?? null;
      if (!wcUse) {
        return apiError(
          "Para MO interna, seleccione o centro de trabalho na linha ou defina um centro padrão no cadastro do produto.",
          400
        );
      }
      const { count: wcOk2 } = await admin
        .from("work_centers")
        .select("*", { count: "exact", head: true })
        .eq("id", wcUse)
        .eq("tenant_id", tenantId);
      if (!wcOk2) return apiError("Centro de trabalho inválido", 400);
      workCenterIdIns = wcUse;
      if (validated.unit_cost !== undefined && validated.unit_cost !== null) {
        unitCost = Number(validated.unit_cost);
      } else if (catalogCost > 0) {
        unitCost = catalogCost;
      } else {
        unitCost = await resolveLaborHourlyRateForBom(admin, tenantId, {
          work_center_id: wcUse,
          production_line_id: compRow.default_production_line_id,
        });
      }
    }
  } else if (!validated.is_labor) {
    const { data: compRow, error: crErr } = await admin
      .from("products")
      .select("cost_price")
      .eq("id", validated.component_product_id!)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (crErr || !compRow) {
      return apiError("Produto componente não encontrado", 404);
    }
    unitCost = Number(compRow.cost_price ?? 0);
    workCenterIdIns = null;
    componentProductIdIns = validated.component_product_id!;
    isLaborIns = false;
    lineExternalLaborIns = false;
  } else if (externalLabor) {
    isLaborIns = true;
    lineExternalLaborIns = true;
    componentProductIdIns = null;
    unitCost = Number(validated.unit_cost ?? 0);
    workCenterIdIns = null;
  } else if (validated.work_center_id) {
    isLaborIns = true;
    lineExternalLaborIns = false;
    componentProductIdIns = null;
    workCenterIdIns = validated.work_center_id;
    if (validated.unit_cost !== undefined && validated.unit_cost !== null) {
      unitCost = validated.unit_cost;
    } else {
      const { data: parentProd } = await admin
        .from("products")
        .select("default_production_line_id")
        .eq("id", parentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      unitCost = await resolveLaborHourlyRateForBom(admin, tenantId, {
        work_center_id: validated.work_center_id,
        production_line_id: parentProd?.default_production_line_id,
      });
    }
  }

  const { data, error } = await admin
    .from("product_components")
    .insert({
      tenant_id: tenantId,
      parent_product_id: validated.parent_product_id,
      component_product_id: componentProductIdIns,
      quantity: validated.quantity,
      unit_cost: unitCost,
      is_labor: isLaborIns,
      work_center_id: lineExternalLaborIns ? null : workCenterIdIns,
      is_external_labor: lineExternalLaborIns,
    })
    .select()
    .single();

  if (error) {
    return apiError(
      "Erro ao adicionar componente: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  await recalculateProductCost(admin, tenantId, parentId);

  return apiOk({ data }, 201);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: parentId } = await params;
  const componentId = request.nextUrl.searchParams.get("componentId");

  if (!componentId) {
    return apiError("Parâmetro componentId é obrigatório", 400);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();

  const { error, count } = await admin
    .from("product_components")
    .delete({ count: "exact" })
    .eq("id", componentId)
    .eq("parent_product_id", parentId)
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError(
      "Erro ao remover componente: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  if (!count) {
    return apiError("Componente não encontrado", 404);
  }

  await recalculateProductCost(admin, tenantId, parentId);

  return apiOk({ success: true });
}

async function recalculateProductCost(
  admin: SupabaseClient<Database>,
  tenantId: string,
  productId: string
): Promise<void> {
  const { data: components } = await admin
    .from("product_components")
    .select("quantity, unit_cost, is_labor, component_product_id")
    .eq("parent_product_id", productId)
    .eq("tenant_id", tenantId);

  const list = components ?? [];
  if (!list.length) {
    return;
  }

  const componentIds = [
    ...new Set(
      list
        .map((c) => c.component_product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const costByProductId = new Map<string, number>();
  if (componentIds.length) {
    const { data: prods } = await admin
      .from("products")
      .select("id, cost_price")
      .eq("tenant_id", tenantId)
      .in("id", componentIds);
    for (const p of prods ?? []) {
      costByProductId.set(p.id, Number(p.cost_price ?? 0));
    }
  }

  const totalCost = list.reduce((sum, comp) => {
    const q = Number(comp.quantity ?? 0);
    if (comp.is_labor) {
      return sum + q * Number(comp.unit_cost ?? 0);
    }
    const cid = comp.component_product_id;
    const unit =
      cid != null
        ? (costByProductId.get(cid) ?? Number(comp.unit_cost ?? 0))
        : Number(comp.unit_cost ?? 0);
    return sum + q * unit;
  }, 0);

  await recordProductPriceHistory(admin, tenantId, productId, {
    priceType: "production_cost",
    value: totalCost,
    notes: "Recalculado a partir da estrutura (BOM)",
  });
}
