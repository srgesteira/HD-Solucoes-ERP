import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { fetchPurchaseOrdersBoard } from "@/lib/purchasing/purchase-orders-board";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const bucket = request.nextUrl.searchParams.get("bucket");
  if (bucket !== "open" && bucket !== "finished") {
    return apiError("bucket deve ser open ou finished", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const rows = await fetchPurchaseOrdersBoard(admin, tenantId, bucket);
    return apiOk({ rows });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar pedidos",
      500
    );
  }
}
