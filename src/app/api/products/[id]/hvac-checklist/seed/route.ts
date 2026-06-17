import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { seedHepaChecklistTemplate } from "@/modules/hvac/lib/hvac-pop-checklist-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("engenharia");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let replace = false;
  try {
    const body = (await request.json()) as { replace?: boolean };
    replace = body.replace === true;
  } catch {
    /* body opcional */
  }

  try {
    const admin = createSupabaseAdminClient();
    const items = await seedHepaChecklistTemplate(
      admin,
      tenantId,
      productId,
      replace
    );
    return apiOk({ items });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao aplicar template",
      400
    );
  }
}
