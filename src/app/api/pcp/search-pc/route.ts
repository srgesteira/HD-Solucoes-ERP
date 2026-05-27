import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";

export const dynamic = "force-dynamic";

function escapeIlike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * GET /api/pcp/search-pc?po_number=PC-001
 * Lista pedidos de compra e itens para vincular ao item de venda (MRP).
 */
export async function GET(request: NextRequest) {
  const gate = await assertModuleAccess("logistics");
  if (!gate.ok) {
    const prod = await assertModuleAccess("production");
    if (!prod.ok) return gate.response;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const poNumber = request.nextUrl.searchParams.get("po_number")?.trim();
  if (!poNumber) {
    return apiError("Informe po_number na query", 400);
  }

  const admin = createSupabaseAdminClient();
  const safe = `%${escapeIlike(poNumber)}%`;

  const { data: pos, error: poErr } = await admin
    .from("purchase_orders")
    .select("id, po_number, order_date, expected_delivery, status")
    .eq("tenant_id", tenantId)
    .ilike("po_number", safe)
    .order("order_date", { ascending: false })
    .limit(20);

  if (poErr) {
    return apiError(poErr.message, supabaseErrorToHttp(poErr.code));
  }

  if (!pos?.length) {
    return apiOk({ purchase_orders: [] });
  }

  const poIds = pos.map((p) => p.id);
  const { data: items, error: iErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, purchase_order_id, description, quantity, sales_order_item_id, product_id"
    )
    .eq("tenant_id", tenantId)
    .in("purchase_order_id", poIds);

  if (iErr) {
    return apiError(iErr.message, supabaseErrorToHttp(iErr.code));
  }

  const byPo = new Map<string, typeof items>();
  for (const it of items ?? []) {
    if (!it.purchase_order_id) continue;
    const list = byPo.get(it.purchase_order_id) ?? [];
    list.push(it);
    byPo.set(it.purchase_order_id, list);
  }

  const purchase_orders = pos.map((po) => ({
    id: po.id,
    po_number: po.po_number,
    order_date: po.order_date,
    expected_delivery: po.expected_delivery,
    status: po.status,
    items: (byPo.get(po.id) ?? []).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      sales_order_item_id: it.sales_order_item_id,
      already_linked: Boolean(it.sales_order_item_id),
    })),
  }));

  return apiOk({ purchase_orders });
}
