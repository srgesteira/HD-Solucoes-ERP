import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const searchParams = request.nextUrl.searchParams;
  const insightType = searchParams.get("type")?.trim() || "";
  const includeDismissed = searchParams.get("include_dismissed") === "true";
  const limitRaw = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, limitRaw))
    : 20;

  let query = supabase
    .from("bi_insights")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("analyzed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeDismissed) {
    query = query.eq("is_dismissed", false);
  }

  if (insightType) {
    query = query.eq("insight_type", insightType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[bi/insights GET]", error);
    return apiError(
      error.message ?? "Erro ao listar insights",
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data });
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const b =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const insightId = typeof b.insightId === "string" ? b.insightId.trim() : "";
  if (!insightId) {
    return apiError("insightId é obrigatório", 400);
  }

  const updateData: {
    is_read?: boolean;
    is_dismissed?: boolean;
  } = {};

  if (typeof b.is_read === "boolean") updateData.is_read = b.is_read;
  if (typeof b.is_dismissed === "boolean") {
    updateData.is_dismissed = b.is_dismissed;
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Defina is_read e/ou is_dismissed", 400);
  }

  const { data, error } = await supabase
    .from("bi_insights")
    .update(updateData)
    .eq("id", insightId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[bi/insights PUT]", error);
    return apiError(
      error.message ?? "Erro ao atualizar insight",
      supabaseErrorToHttp(error.code)
    );
  }

  if (!data) {
    return apiError("Insight não encontrado", 404);
  }

  return apiOk({ data });
}
