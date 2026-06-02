import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("pcp");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
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
  const salesOrderItemId =
    typeof b.sales_order_item_id === "string" ? b.sales_order_item_id : null;
  const orderItemId = typeof b.order_item_id === "string" ? b.order_item_id : null;
  const lineId = typeof b.line_id === "string" ? b.line_id : null;

  if (!lineId) return apiError("line_id é obrigatório", 400);
  if (!salesOrderItemId && !orderItemId) {
    return apiError("Informe sales_order_item_id ou order_item_id", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    if (orderItemId) {
      const { error } = await admin
        .from("order_items")
        .update({ line_id: lineId })
        .eq("id", orderItemId)
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", false);
      if (error) throw new Error(error.message);
      return apiOk({ order_item_id: orderItemId, line_id: lineId });
    }

    const { data: soi, error: soiErr } = await admin
      .from("sales_order_items")
      .select("id, production_order_id, product_id, quantity, description, unit")
      .eq("id", salesOrderItemId!)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (soiErr) throw new Error(soiErr.message);
    if (!soi) return apiError("Linha de venda não encontrada", 404);

    const { data: existing } = await admin
      .from("order_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_suggestion", false)
      .eq("sales_order_item_id", soi.id)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await admin
        .from("order_items")
        .update({ line_id: lineId })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId)
        .eq("is_suggestion", false);
      if (error) throw new Error(error.message);
      return apiOk({ order_item_id: existing.id, line_id: lineId });
    }

    if (!soi.production_order_id) {
      return apiError(
        "Sem ordem de produção. Execute o MRP antes de atribuir linha.",
        400
      );
    }

    const { data: created, error: insErr } = await admin
      .from("order_items")
      .insert({
        tenant_id: tenantId,
        order_id: soi.production_order_id,
        item_number: 1,
        description: soi.description,
        quantity: soi.quantity,
        unit: soi.unit?.trim() || "UN",
        product_id: soi.product_id,
        status: "waiting",
        sales_order_item_id: soi.id,
        line_id: lineId,
        is_suggestion: false,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return apiOk({ order_item_id: created.id, line_id: lineId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao actualizar linha.";
    return apiError(msg, 400);
  }
}
