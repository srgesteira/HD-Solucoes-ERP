import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { RECEIVABLE_STATUSES } from "@/modules/core/types/finance.types";
import { applyTokenFieldIlikeOrFilters } from "@/shared/utils/universal-search";

export const dynamic = "force-dynamic";

const RECEIVABLE_SET = new Set<string>(RECEIVABLE_STATUSES);

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("faturamento");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const overdue = searchParams.get("overdue");
  const client = searchParams.get("client")?.trim();
  const sales_order_id = searchParams.get("sales_order_id")?.trim();

  const page = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10) || 25)
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("receivables")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("is_forecast", false);

  if (sales_order_id) {
    query = query.eq("sales_order_id", sales_order_id);
  }

  if (status && status !== "all") {
    if (!RECEIVABLE_SET.has(status)) {
      return apiError("Status inválido", 400);
    }
    query = query.eq("status", status);
  }

  if (overdue === "1") {
    const today = new Date().toISOString().slice(0, 10);
    query = query
      .in("status", ["pending", "partial"])
      .lt("due_date", today);
  }

  if (client) {
    query = applyTokenFieldIlikeOrFilters(
      query,
      ["client_name", "client_document"],
      client
    );
  }

  const { data, error, count } = await query
    .order("due_date", { ascending: true })
    .range(from, to);

  if (error) {
    return apiError(
      "Erro ao listar contas a receber: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  });
}
