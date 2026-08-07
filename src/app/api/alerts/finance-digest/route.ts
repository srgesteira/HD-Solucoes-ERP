import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";
import { runFinanceAlertChecks } from "@/modules/alerts/lib/finance-alert-checks";
import { buildFinanceAlertMessage } from "@/modules/alerts/lib/finance-alert-message";
import { sendTelegramMessage } from "@/modules/alerts/lib/telegram";

export const dynamic = "force-dynamic";

type Admin = SupabaseClient<Database>;

/** Vercel injeta `Authorization: Bearer <CRON_SECRET>` nas chamadas de cron. */
function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runDigestForTenant(admin: Admin, tenantId: string) {
  const checks = await runFinanceAlertChecks(admin, tenantId);
  const message = buildFinanceAlertMessage(checks);
  const telegramResult = await sendTelegramMessage(message);
  return {
    tenant_id: tenantId,
    telegram_sent: telegramResult.ok,
    telegram_error: telegramResult.ok ? null : telegramResult.error,
    message_preview: message,
    checks,
  };
}

/**
 * GET /api/alerts/finance-digest
 * Agente de alertas nível "só observa e avisa": lê o financeiro (fluxo de
 * caixa, contas do dia/amanhã, entregas/chegadas próximas) e envia um
 * resumo priorizado pro Telegram. Não escreve nada no banco.
 *
 * Dois caminhos de autorização (OR, não substituem um ao outro):
 * - Cron (Vercel): header Authorization bate com CRON_SECRET → roda pra
 *   todos os tenants da tabela `tenants` (hoje só existe 1).
 * - Manual: sessão de usuário válida com acesso a relatórios financeiros →
 *   roda só pro tenant do usuário logado, igual ao comportamento anterior.
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
        results.push(await runDigestForTenant(admin, t.id));
      } catch (err) {
        results.push({
          tenant_id: t.id,
          telegram_sent: false,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }
    return apiOk({ tenants: results });
  }

  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const result = await runDigestForTenant(admin, tenantId);
    return apiOk(result);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao rodar checagens financeiras",
      500
    );
  }
}
