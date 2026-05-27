import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/lib/utils/tenant";
import { rejectQuoteWithReasons } from "@/lib/sales/quote-reject";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id: quoteId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem rejeitar orçamentos", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const reason_ids = Array.isArray(b.reason_ids)
    ? b.reason_ids.filter((x): x is string => typeof x === "string")
    : [];

  const notes =
    b.notes === undefined || b.notes === null
      ? null
      : String(b.notes).trim() || null;

  const admin = createSupabaseAdminClient();
  const result = await rejectQuoteWithReasons(admin, tenantId, quoteId, {
    reason_ids,
    notes,
  });

  if (!result.ok) {
    return apiError(result.message, result.status);
  }

  return apiOk({ success: true });
}
