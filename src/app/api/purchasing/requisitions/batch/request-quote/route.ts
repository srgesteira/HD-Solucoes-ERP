import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertRequisitionsSameSuggestedSupplier } from "@/modules/compras/lib/purchasing/requisition-batch";
import { sendPurchaseQuotationEmail } from "@/modules/compras/lib/purchasing/send-quotation-email";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return String(iso).slice(0, 10);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

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
  if (!ids.length) return apiError("Seleccione pelo menos uma requisição.", 400);

  const message =
    typeof b.message === "string" && b.message.trim()
      ? b.message.trim()
      : "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento.";

  const admin = createSupabaseAdminClient();

  try {
    const supplierId = await assertRequisitionsSameSuggestedSupplier(
      admin,
      tenantId,
      ids
    );

    const { data: supplier, error: supErr } = await admin
      .from("suppliers")
      .select("id, name, legal_name, email")
      .eq("id", supplierId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (supErr) return apiError(supErr.message, 400);
    if (!supplier) return apiError("Fornecedor não encontrado.", 404);

    const supplierName =
      supplier.legal_name?.trim() || supplier.name?.trim() || "Fornecedor";

    const { data: items, error: itemErr } = await admin
      .from("purchase_order_items")
      .select(
        "id, description, quantity, unit, need_date, follow_up_date, product:products!purchase_order_items_product_id_fkey(technical_code, name)"
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
        need_date: fmtDate(row.need_date) ?? fmtDate(row.follow_up_date),
      };
    });

    const to = supplier.email?.trim() ? [supplier.email.trim()] : [];
    const emailResult = await sendPurchaseQuotationEmail({
      to,
      subject: `Solicitação de cotação — ${supplierName}`,
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
        supplier_id: supplierId,
        supplier_name: supplierName,
        item_count: ids.length,
        email_sent: emailResult.sent,
        warning: emailResult.warning ?? null,
      },
    });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao solicitar orçamento",
      400
    );
  }
}
