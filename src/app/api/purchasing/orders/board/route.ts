import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { fetchPurchaseOrdersBoard } from "@/modules/compras/lib/purchasing/purchase-orders-board";

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
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  if (
    bucket !== "open" &&
    bucket !== "finished" &&
    bucket !== "all"
  ) {
    return apiError("bucket deve ser all, open ou finished", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const rows = await fetchPurchaseOrdersBoard(
      admin,
      tenantId,
      bucket,
      search
    );
    return apiOk({ rows });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao carregar pedidos",
      500
    );
  }
}
