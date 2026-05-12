import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { suggestProductStructure } from "@/lib/services/ai.service";

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
  const technicalDescription =
    typeof b.technicalDescription === "string"
      ? b.technicalDescription.trim()
      : "";

  if (!productName) {
    return apiError("Nome do produto é obrigatório", 400);
  }
  if (!technicalDescription) {
    return apiError("Descrição técnica é obrigatória", 400);
  }

  try {
    const suggestion = await suggestProductStructure(
      technicalDescription,
      productName
    );
    return apiOk({ suggestion });
  } catch (e) {
    console.error("[ai/suggest-structure]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao sugerir estrutura",
      supabaseErrorToHttp(null)
    );
  }
}
