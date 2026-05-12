import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { runFullBusinessAnalysis } from "@/lib/services/business-ai.service";
import type { Json } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/** Estado da configuração da IA (sem expor a chave). */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  return apiOk({
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY?.trim(),
  });
}

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem executar a análise de negócio.", 403);
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return apiError(
      "IA indisponível: falta ANTHROPIC_API_KEY no servidor. Na Vercel: Settings → Environment Variables → crie ANTHROPIC_API_KEY (Production) com uma chave de console.anthropic.com e faça Redeploy.",
      503
    );
  }

  let insights;
  try {
    insights = await runFullBusinessAnalysis(tenantId);
  } catch (e) {
    console.error("[ai/business-analysis]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao analisar o negócio",
      supabaseErrorToHttp(null)
    );
  }

  if (insights.length > 0) {
    const rows = insights.map((insight) => ({
      tenant_id: tenantId,
      insight_type: insight.type,
      title: insight.title,
      description: insight.description,
      recommendation: insight.recommendation ?? null,
      priority: insight.priority,
      metrics:
        insight.metrics !== undefined && insight.metrics !== null
          ? (insight.metrics as unknown as Json)
          : null,
      analyzed_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("bi_insights").insert(rows);
    if (error) {
      console.error("[ai/business-analysis] insert insights", error);
      return apiError(error.message ?? "Erro ao guardar insights", 500);
    }
  }

  return apiOk({ insights });
}
