import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { analyzeProductTax } from "@/lib/services/tax-ai.service";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem usar análise fiscal (IA).", 403);
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

  const productId =
    typeof b.productId === "string" ? b.productId.trim() : "";

  if (!productId || !UUID_RE.test(productId)) {
    return apiError("productId é obrigatório e deve ser um UUID válido", 400);
  }

  try {
    const analysis = await analyzeProductTax(productId, tenantId);
    return apiOk({ analysis });
  } catch (e) {
    console.error("[ai/tax-analysis]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao analisar tributos",
      supabaseErrorToHttp(null)
    );
  }
}
