import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { suggestNCM } from "@/modules/engenharia/lib/services/ai.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem usar sugestões de IA.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const b =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const productName =
    typeof b.productName === "string" ? b.productName.trim() : "";
  const productDescription =
    typeof b.productDescription === "string" ? b.productDescription.trim() : "";

  if (!productName) {
    return apiError("Nome do produto é obrigatório", 400);
  }

  try {
    const suggestion = await suggestNCM(
      productDescription || productName,
      productName
    );
    return apiOk({ suggestion });
  } catch (e) {
    console.error("[ai/suggest-ncm]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao sugerir NCM",
      supabaseErrorToHttp(null)
    );
  }
}
