import type { UntypedAdmin } from "@/shared/db/supabase/untyped-tables";

/**
 * Banco de aprendizado (Fase 4 — Módulo E).
 * Regras de ouro: sem atalho (a regra diz quem/qual; a ação segue a matriz de risco),
 * só decisões do Claude ou do diretor, expira em 6 meses sem confirmação, fonte única no Supabase.
 */

export const LEARNING_COLS =
  "id, context, original_question, approved_answer, source, risk, approval_id, last_confirmed_at, created_at, updated_at, agent_id, agents(slug, name)";

type Row = {
  id: string;
  context: string;
  original_question: string;
  approved_answer: unknown;
  source: string;
  risk: string;
  approval_id: string | null;
  last_confirmed_at: string;
  created_at: string;
  updated_at: string;
  agent_id: string;
  agents: { slug: string; name: string } | null;
};

/** Regra de ouro 3: confirmada há mais de 6 meses = vencida (mesmo critério da view robot_learning_valid). */
export function limiteValidade(agora = new Date()): string {
  const d = new Date(agora);
  d.setMonth(d.getMonth() - 6);
  return d.toISOString();
}

export function formatLearning(r: Row) {
  const venceEm = new Date(r.last_confirmed_at);
  venceEm.setMonth(venceEm.getMonth() + 6);
  return {
    id: r.id,
    robo: r.agents?.slug ?? null,
    robo_nome: r.agents?.name ?? null,
    contexto: r.context,
    pergunta_original: r.original_question,
    resposta_aprovada: r.approved_answer,
    fonte: r.source,
    risco: r.risk,
    aprovacao_id: r.approval_id,
    ultima_confirmacao: r.last_confirmed_at,
    vence_em: venceEm.toISOString(),
    valida: venceEm.getTime() > Date.now(),
    criado_em: r.created_at,
  };
}

export type RegraValida = ReturnType<typeof formatLearning>;

/** Regra válida (últimos 6 meses) de um robô para um contexto exato, ou null. */
export async function regraValida(
  db: UntypedAdmin,
  tenantId: string,
  agentId: string,
  contexto: string
): Promise<RegraValida | null> {
  const { data } = await db
    .from("robot_learning")
    .select(LEARNING_COLS)
    .eq("tenant_id", tenantId)
    .gt("last_confirmed_at", limiteValidade())
    .eq("agent_id", agentId)
    .eq("context", contexto)
    .maybeSingle();
  return data ? formatLearning(data as unknown as Row) : null;
}

/** Contexto padrão da carga inicial: fornecedor de cada item. */
export const contextoFornecedorItem = (produtoId: string) => `fornecedor_item:${produtoId}`;

export const CONTEXTO_VALIDO = /^[a-z0-9_]{2,40}:[^\s]{1,160}$/i;
