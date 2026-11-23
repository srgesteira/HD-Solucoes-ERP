import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import { runFinanceAlertChecks } from "@/modules/alerts/lib/finance-alert-checks";
import { buildFinanceAlertMessage } from "@/modules/alerts/lib/finance-alert-message";
import { findAgentBySlug, writeAuditLog } from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";

type Admin = SupabaseClient<Database>;

/** Robô do registro (agents) que representa este alerta. */
const AGENT_SLUG = "alertas_financeiros";

/** Vercel injeta `Authorization: Bearer <CRON_SECRET>` nas chamadas de cron. */
function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Texto sem HTML, para leitura no log e no resumo das 8h. */
function toPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function runDigestForTenant(admin: Admin, tenantId: string, origem: "cron" | "manual") {
  const started = Date.now();
  const db = asUntypedAdmin(admin);
  const agent = await findAgentBySlug(db, tenantId, AGENT_SLUG);
  const checks = await runFinanceAlertChecks(admin, tenantId);
  const texto = toPlainText(buildFinanceAlertMessage(checks));

  const resumo = {
    origem,
    colisao_caixa: checks.cashCollision.hasCollision
      ? { data: checks.cashCollision.date, furo: checks.cashCollision.shortfall }
      : null,
    hoje: {
      data: checks.billsToday.date,
      a_pagar: checks.billsToday.payables.length,
      a_receber: checks.billsToday.receivables.length,
    },
    amanha: {
      data: checks.billsTomorrow.date,
      a_pagar: checks.billsTomorrow.payables.length,
      a_receber: checks.billsTomorrow.receivables.length,
    },
    entregas_venda_3d: checks.salesDeliveries.length,
    chegadas_compra_3d: checks.purchaseArrivals.length,
  };

  const log = await writeAuditLog(db, {
    tenantId,
    agentId: agent?.id ?? null,
    action: "alerta_financeiro",
    outcome: "ok",
    actor: "sistema",
    result: { ...resumo, texto },
    durationMs: Date.now() - started,
  });

  return {
    tenant_id: tenantId,
    gravado_no_log: !log.error,
    log_id: log.id,
    log_error: log.error,
    resumo,
    message_preview: texto,
    checks,
  };
}

/**
 * GET /api/alerts/finance-digest
 * Alerta financeiro "só observa e avisa": lê o financeiro (fluxo de caixa,
 * contas do dia/amanhã, entregas/chegadas próximas) e GRAVA o resumo no log
 * dos robôs (agent_audit_log, ação 'alerta_financeiro'). O Auditor das 8h lê
 * dali. Não manda mais Telegram (regra "nada de Telegram", Fase 4 / Ordem 3).
 *
 * Dois caminhos de autorização (OR):
 * - Cron (Vercel): header Authorization bate com CRON_SECRET → roda pra
 *   todos os tenants da tabela `tenants` (hoje só existe 1).
 * - Manual: sessão de usuário com acesso a relatórios financeiros →
 *   roda só pro tenant do usuário logado.
 */
export async function GET(request: NextRequest) {
  const isCron = isAuthorizedCronRequest(request);
  const admin = createSupabaseAdminClient();

  if (isCron) {
    const { data: tenants, error } = await admin.from("tenants").select("id");
    if (error) {
      return apiError("Erro ao listar tenants: " + error.message, 500);
    }

    const results = [];
    for (const t of tenants ?? []) {
      try {
        results.push(await runDigestForTenant(admin, t.id, "cron"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        await writeAuditLog(asUntypedAdmin(admin), {
          tenantId: t.id,
          agentId: (await findAgentBySlug(asUntypedAdmin(admin), t.id, AGENT_SLUG))?.id ?? null,
          action: "alerta_financeiro",
          outcome: "erro",
          actor: "sistema",
          error: msg,
        });
        results.push({ tenant_id: t.id, gravado_no_log: false, error: msg });
      }
    }
    return apiOk({ tenants: results });
  }

  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const result = await runDigestForTenant(admin, tenantId, "manual");
    return apiOk(result);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao rodar checagens financeiras",
      500
    );
  }
}
