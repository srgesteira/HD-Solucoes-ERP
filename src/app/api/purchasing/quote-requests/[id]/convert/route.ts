import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { convertPurchaseQuoteRequestToOrder } from "@/modules/compras/lib/purchasing/purchase-quote-request-convert";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (!id) return apiError("ID em falta", 400);

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
  const supplier_id =
    typeof b.supplier_id === "string" ? b.supplier_id.trim() : "";
  if (!supplier_id) return apiError("Seleccione o fornecedor.", 400);

  const lines = Array.isArray(b.lines)
    ? b.lines
        .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
        .map((row) => ({
          item_id: typeof row.item_id === "string" ? row.item_id : "",
          unit_price:
            row.unit_price !== undefined ? Number(row.unit_price) : undefined,
          quantity:
            row.quantity !== undefined ? Number(row.quantity) : undefined,
        }))
        .filter((row) => row.item_id)
    : undefined;

  const admin = createSupabaseAdminClient();
  const result = await convertPurchaseQuoteRequestToOrder(
    admin,
    tenantId,
    id,
    user.id,
    { supplier_id, lines }
  );

  if (!result.ok) return apiError(result.message, result.status);
  return apiOk({ data: result });
}
