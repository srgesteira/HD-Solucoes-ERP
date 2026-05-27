import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, currentUserCanMenuModule } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  let query = db
    .from("credit_analysis")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.limit(200);
  if (error) return apiError(error.message, 500);
  return apiOk({ data: data ?? [] });
}
