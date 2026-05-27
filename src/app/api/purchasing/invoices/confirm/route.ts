import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { purchaseInvoiceConfirmSchema } from "@/shared/contracts/purchase-invoice.schema";
import { applyPurchaseInvoiceConfirm } from "@/modules/compras/lib/purchasing/apply-purchase-invoice-confirm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão para confirmar conciliação.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = purchaseInvoiceConfirmSchema.safeParse(body);
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ?? "Dados de conciliação inválidos.";
    return apiError(msg, 400);
  }

  if (parsed.data.supplierId) {
    const admin = createSupabaseAdminClient();
    const { data: sup } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", parsed.data.supplierId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!sup) return apiError("Fornecedor inválido.", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await applyPurchaseInvoiceConfirm(
      admin,
      tenantId,
      user.id,
      parsed.data
    );
    return apiOk({ data: result });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao processar conciliação.",
      500
    );
  }
}
