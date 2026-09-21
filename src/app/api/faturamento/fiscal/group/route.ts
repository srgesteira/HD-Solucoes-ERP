import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  createNfeInvoiceGroup,
  dissolveNfeInvoiceGroup,
} from "@/modules/faturamento/lib/nfe-invoice-group";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return apiError("Body inválido", 400);
  }

  const rawIds = body.sales_order_ids;
  const salesOrderIds = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === "string")
    : [];

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createSupabaseAdminClient();
  try {
    const result = await createNfeInvoiceGroup(
      admin,
      tenantId,
      salesOrderIds,
      user?.id ?? null
    );
    if (!result.ok) return apiError(result.message, 400);
    return apiOk({ data: result.group });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao agrupar pedidos",
      500
    );
  }
}

type DeleteParams = { params: Promise<{ groupId?: string }> };

export async function DELETE(request: NextRequest, context: DeleteParams) {
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const fromParams = context?.params ? await context.params : {};
  const groupId =
    (typeof fromParams.groupId === "string" ? fromParams.groupId : "") ||
    request.nextUrl.searchParams.get("groupId")?.trim() ||
    "";
  if (!groupId) return apiError("groupId é obrigatório.", 400);

  const admin = createSupabaseAdminClient();
  try {
    const result = await dissolveNfeInvoiceGroup(admin, tenantId, groupId);
    if (!result.ok) return apiError(result.message, 409);
    return apiOk({ ok: true });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao desagrupar",
      500
    );
  }
}
