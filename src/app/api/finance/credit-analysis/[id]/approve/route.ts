import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, currentUserCanMenuModule } from "@/modules/core/lib/tenant";
import { approveCreditAnalysis } from "@/modules/faturamento/lib/credit-analysis";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await currentUserCanMenuModule("faturamento"))) {
    return apiError("Sem permissão", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const approved_amount =
    body && typeof body === "object" && "approved_amount" in body
      ? Number((body as { approved_amount?: unknown }).approved_amount)
      : undefined;

  try {
    const admin = createSupabaseAdminClient();
    const data = await approveCreditAnalysis(
      admin,
      tenantId,
      id,
      user.id,
      Number.isFinite(approved_amount) ? approved_amount : undefined
    );
    return apiOk({ data });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao aprovar", 400);
  }
}
