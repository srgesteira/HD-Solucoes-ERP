import type { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

/**
 * Trava de segurança da prospecção (regra do Helder): no máximo 15 e-mails de prospecção por dia,
 * para o domínio hdindustrial.ind.br não cair em spam. Vale para qualquer chamada — n8n, Claude ou
 * tela —, porque a contagem vem do CRM (e-mails de saída com resumo "Prospecção ..." desde 0h de
 * São Paulo), e não do que quem chamou diz. Mudar o número só aqui.
 */
export const LIMITE_DIARIO_PROSPECCAO = 15;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Início do dia de hoje em São Paulo (UTC−3, sem horário de verão desde 2019). */
function inicioDoDiaSaoPaulo(): string {
  return `${todayIsoSaoPaulo()}T00:00:00-03:00`;
}

/** Quantos e-mails de prospecção já saíram hoje (robô ou manual registrado no CRM). */
export async function enviosProspeccaoHoje(admin: Admin, tenant: string): Promise<number> {
  const { count, error } = await asUntypedAdmin(admin)
    .from("crm_activities")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .eq("type", "email")
    .eq("direction", "saida")
    .ilike("summary", "Prospecção%")
    .gte("occurred_at", inicioDoDiaSaoPaulo());
  // Na dúvida, trava: se não der para contar, considera o limite batido.
  if (error) throw new Error("Não consegui contar os envios de hoje: " + error.message);
  return count ?? 0;
}

/** Quantos ainda podem sair hoje (nunca negativo). */
export async function restanteProspeccaoHoje(admin: Admin, tenant: string): Promise<number> {
  return Math.max(0, LIMITE_DIARIO_PROSPECCAO - (await enviosProspeccaoHoje(admin, tenant)));
}
