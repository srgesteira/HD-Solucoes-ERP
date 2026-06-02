import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { currentUserCanPcpPlanning } from "@/modules/pcp/lib/pcp-api-auth";
import {
  commitMrpSuggestionsForTenant,
  generateMrpSuggestionsForPendingOrders,
} from "@/modules/pcp/lib/mrp-service";

export const dynamic = "force-dynamic";

type Action = "generate" | "commit";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("pcp");
  if (moduleDenied) return moduleDenied;
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
  }
  // Mantém restrição forte como o MRP atual: apenas admin.
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
  const action = (typeof b.action === "string" ? b.action : "generate") as Action;
  if (action !== "generate" && action !== "commit") {
    return apiError("action deve ser generate ou commit", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    if (action === "commit") {
      const committed = await commitMrpSuggestionsForTenant(admin, tenantId);
      return apiOk({ committed });
    }
    const generated = await generateMrpSuggestionsForPendingOrders(
      admin,
      tenantId,
      user.id
    );
    return apiOk({ generated });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro no MRP.", 400);
  }
}

