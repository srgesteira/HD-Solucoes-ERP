import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import {
  calculateNeededMaterials,
  createProductionOrderIfFeasible,
  generatePurchaseOrders,
  getNetRequirements,
} from "@/lib/mrp-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem executar o MRP.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const sales_order_id =
    typeof b.sales_order_id === "string" ? b.sales_order_id.trim() : "";
  if (!sales_order_id) return apiError("sales_order_id é obrigatório.", 400);

  const confirm = b.confirm === true;

  const admin = createSupabaseAdminClient();

  try {
    const gross = await calculateNeededMaterials(
      admin,
      tenantId,
      sales_order_id
    );
    const requirements = await getNetRequirements(admin, tenantId, gross);
    const has_shortage = requirements.some((r) => r.shortage > 0.0001);

    if (!confirm) {
      return apiOk({
        requirements,
        summary: { has_shortage, lines: requirements.length },
      });
    }

    const poResult = await generatePurchaseOrders(
      admin,
      tenantId,
      user.id,
      requirements
    );

    let production_order_id: string | undefined;
    let production_error: string | undefined;
    try {
      const out = await createProductionOrderIfFeasible(
        admin,
        tenantId,
        sales_order_id,
        user.id
      );
      production_order_id = out.production_order_id;
    } catch (e) {
      production_error =
        e instanceof Error ? e.message : "Falha ao criar ordem de produção.";
    }

    return apiOk({
      requirements,
      purchase_orders: poResult.purchase_orders,
      production_order_id,
      production_error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no MRP.";
    return apiError(msg, 400);
  }
}
