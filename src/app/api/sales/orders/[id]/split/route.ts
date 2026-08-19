import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import {
  parseSplitLines,
  splitSalesOrder,
} from "@/modules/vendas/lib/sales/sales-order-split";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canSales = await currentUserCanModule("sales");
  if (!isAdmin && !canSales) {
    return apiError("Sem permissão para desmembrar pedidos de venda", 403);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const parsed = parseSplitLines(body.lines);
  if (!parsed.ok) return apiError(parsed.message, 400);

  const admin = createSupabaseAdminClient();
  const result = await splitSalesOrder(
    admin,
    tenantId,
    id,
    parsed.lines,
    user.id
  );
  if (!result.ok) {
    return apiError(result.message, result.status);
  }
  return apiOk({ data: result.data });
}
