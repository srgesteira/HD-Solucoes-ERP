import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { scanFiscalInconsistencies } from "@/modules/fiscal/lib/fiscal-inconsistency-scan";
import { explainFiscalInconsistencies } from "@/modules/engenharia/lib/services/ai.service";
import { remediateFiscalInconsistencies } from "@/modules/fiscal/lib/fiscal-inconsistency-remediate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const explain = request.nextUrl.searchParams.get("explain") === "1";

  try {
    const admin = createSupabaseAdminClient();
    const issues = await scanFiscalInconsistencies(admin, tenantId);

    if (!explain) {
      return apiOk({
        issues,
        total: issues.length,
        blockers: issues.filter((i) => i.severity === "blocker").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
      });
    }

    const explanation = await explainFiscalInconsistencies(
      issues.map((i) => ({
        check_id: i.check_id,
        severity: i.severity,
        title: i.title,
        impact: i.impact,
        count: i.count,
        detail: i.detail,
      }))
    );

    return apiOk({ issues, explanation });
  } catch (e) {
    console.error("[fiscal/inconsistencies]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao analisar inconsistências",
      supabaseErrorToHttp(null)
    );
  }
}

/** Agente: executa remediação (cria/activa regras, CFOP, reaplica PVs) + resumo. */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const remediation = await remediateFiscalInconsistencies(
      admin,
      tenantId,
      user.id
    );

    let explanation: {
      summary: string;
      priorities: string[];
      disclaimer: string;
    } | null = null;

    try {
      explanation = await explainFiscalInconsistencies(
        remediation.remaining.map((i) => ({
          check_id: i.check_id,
          severity: i.severity,
          title: i.title,
          impact: i.impact,
          count: i.count,
          detail: i.detail,
        }))
      );
    } catch {
      explanation = {
        summary: remediation.summary,
        priorities: remediation.actions
          .filter((a) => a.status === "done")
          .map((a) => `${a.step}: ${a.detail}`),
        disclaimer:
          "Remediação automática executada. Alíquotas fora do Simples Nacional devem ser revistas pela contadora.",
      };
    }

    // Prefere o resumo das acções executadas; prioridades = passos feitos + o que resta
    const priorities = [
      ...remediation.actions
        .filter((a) => a.status === "done")
        .map((a) => `Feito — ${a.step}: ${a.detail}`),
      ...(explanation?.priorities ?? []).map((p) => `Pendente — ${p}`),
      ...remediation.actions
        .filter((a) => a.status === "blocked")
        .map((a) => `Bloqueado — ${a.step}: ${a.detail}`),
    ];

    return apiOk({
      issues: remediation.remaining,
      total: remediation.remaining.length,
      blockers: remediation.remaining.filter((i) => i.severity === "blocker")
        .length,
      warnings: remediation.remaining.filter((i) => i.severity === "warning")
        .length,
      remediation: {
        summary: remediation.summary,
        actions: remediation.actions,
        rules_created: remediation.rules_created,
        rules_activated: remediation.rules_activated,
        orders_reapplied: remediation.orders_reapplied,
        issues_before: remediation.issues_before,
        issues_after: remediation.issues_after,
      },
      explanation: {
        summary: remediation.summary,
        priorities,
        disclaimer:
          explanation?.disclaimer ??
          "O assistente executa cadastro estrutural e reaplicação. Não substitui a contadora em alíquotas complexas.",
      },
    });
  } catch (e) {
    console.error("[fiscal/inconsistencies POST]", e);
    return apiError(
      e instanceof Error ? e.message : "Erro ao remediar inconsistências",
      supabaseErrorToHttp(null)
    );
  }
}
