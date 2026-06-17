import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { matchBankStatementLine } from "@/modules/finance/lib/bank-reconciliation-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("finance");
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
  const kind =
    b.kind === "receivable" || b.kind === "payable" || b.kind === "ignore"
      ? b.kind
      : null;
  if (!kind) return apiError("kind inválido (receivable|payable|ignore)", 400);

  const admin = createSupabaseAdminClient();
  try {
    await matchBankStatementLine(admin, tenantId, id, {
      kind,
      target_id:
        b.target_id === null || b.target_id === undefined
          ? null
          : String(b.target_id),
    });
    return apiOk({ success: true });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Erro", 500);
  }
}
