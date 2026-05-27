import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { processMrpForPendingOrders } from "@/lib/mrp-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem executar o MRP.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const confirm = b.confirm === true;

  const admin = createSupabaseAdminClient();

  try {
    const batch = await processMrpForPendingOrders(
      admin,
      tenantId,
      user.id,
      confirm
    );
    return apiOk(batch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no MRP em lote.";
    return apiError(msg, 400);
  }
}
