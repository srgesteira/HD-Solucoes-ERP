import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { receiveSalesReturn } from "@/modules/reverse/lib/sales-returns-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    await receiveSalesReturn(admin, {
      tenantId,
      userId: user.id,
      userEmail: user.email ?? null,
      returnId: id,
    });
    return apiOk({ ok: true });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao receber devolução",
      400
    );
  }
}
