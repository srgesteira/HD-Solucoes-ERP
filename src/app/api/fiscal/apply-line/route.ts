import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { applyFiscalToLine } from "@/modules/fiscal/lib/fiscal-rules-service";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import type { FiscalOperationType } from "@/modules/fiscal/lib/fiscal-rules-types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }

  const operationType = body.operation_type as FiscalOperationType | undefined;
  const documentType = body.document_type as
    | "sales_order_item"
    | "purchase_order_item"
    | undefined;
  const documentLineId =
    typeof body.document_line_id === "string" ? body.document_line_id : "";
  const productId = typeof body.product_id === "string" ? body.product_id : "";
  const quantity = Number(body.quantity ?? 0);
  const unitPrice = Number(body.unit_price ?? 0);
  const preview = body.preview === true;
  const customerOrSupplierUf =
    typeof body.destination_uf === "string" ? body.destination_uf : null;

  if (!operationType || !["sale", "purchase"].includes(operationType)) {
    return apiError("operation_type inválido", 400);
  }
  if (
    !documentType ||
    !["sales_order_item", "purchase_order_item"].includes(documentType)
  ) {
    return apiError("document_type inválido", 400);
  }
  if (!documentLineId || !productId) {
    return apiError("document_line_id e product_id são obrigatórios", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    const result = await applyFiscalToLine(admin, tenantId, {
      operationType,
      documentType,
      documentLineId,
      productId,
      quantity,
      unitPrice,
      customerOrSupplierUf,
      preview,
      appliedBy: user.id,
    });

    if (!preview) {
      const table =
        documentType === "sales_order_item"
          ? "sales_order_items"
          : "purchase_order_items";
      const db = asUntypedAdmin(admin);

      if (result.taxFields) {
        const { error: upErr } = await db
          .from(table)
          .update({
            icms_rate: result.taxFields.icmsRate,
            icms_value: result.taxFields.icmsValue,
            ipi_rate: result.taxFields.ipiRate,
            ipi_value: result.taxFields.ipiValue,
            tax_base: result.taxFields.taxBase,
          })
          .eq("id", documentLineId)
          .eq("tenant_id", tenantId);

        if (upErr) throw new Error(upErr.message);
      }

      const orderTable =
        documentType === "sales_order_item" ? "sales_orders" : "purchase_orders";
      const lineTable =
        documentType === "sales_order_item"
          ? "sales_order_items"
          : "purchase_order_items";
      const orderFk =
        documentType === "sales_order_item"
          ? "sales_order_id"
          : "purchase_order_id";

      const { data: line } = await db
        .from(lineTable)
        .select(orderFk)
        .eq("id", documentLineId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      const orderId = line?.[orderFk as keyof typeof line] as string | undefined;
      if (orderId) {
        await db
          .from(orderTable)
          .update({ fiscal_status: result.fiscalStatus })
          .eq("id", orderId)
          .eq("tenant_id", tenantId);
      }
    }

    return apiOk({
      match: result.match,
      tax_fields: result.taxFields,
      fiscal_status: result.fiscalStatus,
      preview,
    });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao aplicar regra fiscal",
      supabaseErrorToHttp(null)
    );
  }
}
