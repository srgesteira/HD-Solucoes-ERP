import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { isInvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { BlingApiError } from "@/modules/fiscal/lib/bling/bling-errors";
import { ensureBlingPedidoForSalesOrder } from "@/modules/fiscal/lib/bling/bling-pedido";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data: so, error } = await db
    .from("sales_orders")
    .select("id, invoice_document_type")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return apiError(error.message, 400);
  if (!so) return apiError("Pedido não encontrado", 404);

  const docType = (so as { invoice_document_type?: string | null })
    .invoice_document_type;
  if (!isInvoiceDocumentType(docType) || (docType !== "nfe_product" && docType !== "nfe_industrialization")) {
    return apiError(
      "Só é possível preparar pedido no Bling para NF-e produto ou industrialização.",
      400
    );
  }

  try {
    const data = await ensureBlingPedidoForSalesOrder(
      admin,
      tenantId,
      orderId,
      docType
    );
    return apiOk({ data });
  } catch (e) {
    const message =
      e instanceof BlingApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Erro ao preparar o pedido no Bling.";
    return apiError(message, e instanceof BlingApiError ? e.status || 400 : 400);
  }
}
