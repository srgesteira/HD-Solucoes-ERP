import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, currentUserCanMenuModule } from "@/modules/core/lib/tenant";
import { rejectCreditAnalysis } from "@/modules/faturamento/lib/credit-analysis";

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
    return apiError("Body inválido", 400);
  }
  const rejection_reason =
    body && typeof body === "object" && "rejection_reason" in body
      ? String((body as { rejection_reason?: unknown }).rejection_reason ?? "")
      : "";

  try {
    const admin = createSupabaseAdminClient();
    const data = await rejectCreditAnalysis(
      admin,
      tenantId,
      id,
      user.id,
      rejection_reason
    );
    return apiOk({ data });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro ao rejeitar", 400);
  }
}
