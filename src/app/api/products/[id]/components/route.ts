import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { productComponentSchema } from "@/lib/schemas/product.schema";
import { getLatestLaborHourlyRateForWorkCenter } from "@/lib/labor-cost-utils";
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
  const { id: parentId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

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

  if (!validated.is_labor) {
    const { count: compOk } = await admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("id", validated.component_product_id!)
      .eq("tenant_id", tenantId);
    if (!compOk) return apiError("Produto componente não encontrado", 404);
  }

  const externalLabor = validated.is_labor && validated.is_external_labor === true;

  if (validated.is_labor && !externalLabor) {
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

  if (validated.work_center_id && !validated.is_labor) {
    const { count: wcOk } = await admin
      .from("work_centers")
      .select("*", { count: "exact", head: true })
      .eq("id", validated.work_center_id)
      .eq("tenant_id", tenantId);
    if (!wcOk) return apiError("Centro de trabalho inválido", 400);
  }

  let unitCost = 0;
  if (!validated.is_labor) {
    const { data: component } = await admin
      .from("products")
      .select("cost_price")
      .eq("id", validated.component_product_id!)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    unitCost = Number(component?.cost_price ?? 0);
  } else if (externalLabor) {
    unitCost = Number(validated.unit_cost ?? 0);
  } else if (validated.work_center_id) {
    if (validated.unit_cost !== undefined && validated.unit_cost !== null) {
      unitCost = validated.unit_cost;
    } else {
      const fromLabor = await getLatestLaborHourlyRateForWorkCenter(
        admin,
        tenantId,
        validated.work_center_id
      );
      const { data: workCenter } = await admin
        .from("work_centers")
        .select("hourly_cost")
        .eq("id", validated.work_center_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      unitCost = fromLabor ?? Number(workCenter?.hourly_cost ?? 0);
    }
  }

  const { data, error } = await admin
    .from("product_components")
    .insert({
      tenant_id: tenantId,
      parent_product_id: validated.parent_product_id,
      component_product_id: validated.is_labor
        ? null
        : validated.component_product_id!,
      quantity: validated.quantity,
      unit_cost: unitCost,
      is_labor: validated.is_labor,
      work_center_id: externalLabor ? null : (validated.work_center_id ?? null),
      is_external_labor:
        validated.is_labor === true && validated.is_external_labor === true,
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
    .select("quantity, unit_cost")
    .eq("parent_product_id", productId)
    .eq("tenant_id", tenantId);

  const list = components ?? [];
  const totalCost = list.reduce((sum, comp) => {
    const uc = Number(comp.unit_cost ?? 0);
    const q = Number(comp.quantity ?? 0);
    return sum + q * uc;
  }, 0);

  await admin
    .from("products")
    .update({ cost_price: totalCost })
    .eq("id", productId)
    .eq("tenant_id", tenantId);
}
