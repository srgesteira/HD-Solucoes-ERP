import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { updateOrderItemOperationStatus } from "@/modules/pcp/lib/product-routing-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATUSES = new Set(["pending", "in_progress", "completed", "skipped"]);

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("producao");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const status = typeof b.status === "string" ? b.status : "";
  if (!STATUSES.has(status)) {
    return apiError("status inválido", 400);
  }

  const admin = createSupabaseAdminClient();
  try {
    await updateOrderItemOperationStatus(
      admin,
      tenantId,
      id,
      status as "pending" | "in_progress" | "completed" | "skipped"
    );
    return apiOk({ success: true });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro",
      supabaseErrorToHttp(undefined)
    );
  }
}
