import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { issueRequisitionsAsPurchaseOrder } from "@/lib/purchasing/requisition-issue";
import { assertRequisitionsSameSuggestedSupplier } from "@/lib/purchasing/requisition-batch";

export const dynamic = "force-dynamic";

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
  const supplier_id =
    typeof b.supplier_id === "string" && b.supplier_id.trim()
      ? b.supplier_id.trim()
      : null;

  try {
    const admin = createSupabaseAdminClient();
    const resolvedSupplier =
      supplier_id ??
      (await assertRequisitionsSameSuggestedSupplier(admin, tenantId, ids));
    const result = await issueRequisitionsAsPurchaseOrder(
      admin,
      tenantId,
      user.id,
      ids,
      { supplier_id: resolvedSupplier }
    );
    return apiOk({ data: result });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao emitir PC", 400);
  }
}
