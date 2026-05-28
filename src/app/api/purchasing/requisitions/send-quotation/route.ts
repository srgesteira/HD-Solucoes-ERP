import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { sendPurchaseQuotationEmail } from "@/modules/compras/lib/purchasing/send-quotation-email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("compras");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const ids = Array.isArray(b.requisition_ids)
    ? b.requisition_ids.filter((id): id is string => typeof id === "string")
    : [];
  const supplier_emails = Array.isArray(b.supplier_emails)
    ? b.supplier_emails.filter((e): e is string => typeof e === "string")
    : [];
  const message =
    typeof b.message === "string" && b.message.trim()
      ? b.message.trim()
      : "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento.";
  const quantities =
    b.quantities && typeof b.quantities === "object"
      ? (b.quantities as Record<string, unknown>)
      : {};

  if (!ids.length) return apiError("Seleccione pelo menos uma requisição.", 400);

  const admin = createSupabaseAdminClient();

  for (const [reqId, qty] of Object.entries(quantities)) {
    if (!ids.includes(reqId)) continue;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) continue;
    const { data: row } = await admin
      .from("purchase_order_items")
      .select("unit_price")
      .eq("id", reqId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const unitPrice = Number(row?.unit_price ?? 0);
    await admin
      .from("purchase_order_items")
      .update({
        quantity: n,
        total_price: Math.round(n * unitPrice * 100) / 100,
      })
      .eq("id", reqId)
      .eq("tenant_id", tenantId)
      .eq("status", "draft")
      .is("purchase_order_id", null);
  }

  const { data: items, error: itemErr } = await admin
    .from("purchase_order_items")
    .select(
      "id, description, quantity, unit, product:products!purchase_order_items_product_id_fkey(technical_code, name)"
    )
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .eq("status", "draft")
    .is("purchase_order_id", null);

  if (itemErr) return apiError(itemErr.message, 400);
  if ((items ?? []).length !== ids.length) {
    return apiError("Uma ou mais requisições não estão disponíveis.", 404);
  }

  const lines = (items ?? []).map((row) => {
    const p = Array.isArray(row.product) ? row.product[0] : row.product;
    return {
      code: p?.technical_code ?? "—",
      description: p?.name ?? row.description,
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "UN",
    };
  });

  try {
    const emailResult = await sendPurchaseQuotationEmail({
      to: supplier_emails,
      message,
      lines,
    });

    const now = new Date().toISOString();
    await admin
      .from("purchase_order_items")
      .update({ quotation_sent_at: now })
      .eq("tenant_id", tenantId)
      .in("id", ids);

    return apiOk({
      data: {
        updated_count: ids.length,
        email_sent: emailResult.sent,
        warning: emailResult.warning ?? null,
      },
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao enviar orçamento", 400);
  }
}
