import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { isInvoiceDocumentType } from "@/modules/core/types/sales-order-billing.types";
import { setSalesOrderInvoiceDocumentType } from "@/modules/faturamento/lib/invoice-document-type";
import { getFiscalOrderReview } from "@/modules/faturamento/lib/fiscal-order-review-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem definir o tipo de nota.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const body = (await request.json().catch(() => ({}))) as {
    invoice_document_type?: string;
  };
  const docType = body.invoice_document_type?.trim() ?? "";
  if (!isInvoiceDocumentType(docType)) {
    return apiError(
      "invoice_document_type deve ser nfse, nfe_product ou nfe_industrialization.",
      400
    );
  }

  const admin = createSupabaseAdminClient();

  try {
    const result = await setSalesOrderInvoiceDocumentType(
      admin,
      tenantId,
      orderId,
      docType
    );
    if (!result.ok) {
      return apiError(result.reasons.join(" "), 400);
    }
    const review = await getFiscalOrderReview(admin, tenantId, orderId);
    return apiOk({ data: review });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao gravar tipo de nota.",
      400
    );
  }
}
