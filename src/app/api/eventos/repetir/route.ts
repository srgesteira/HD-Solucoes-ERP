import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { authenticateAgent, writeAuditLog } from "@/modules/agent/lib/governance";
import { lerFeriados } from "@/modules/agent/lib/feriados";
import { INTERVALO_REPUSH_MIN, dentroDoHorarioUtil, minutosUteis } from "@/modules/agent/lib/tempo-util";

export const dynamic = "force-dynamic";

/**
 * POST /api/eventos/repetir — Etapa 7 do plano v2.2 (push repetido).
 * Devolve os eventos CRÍTICOS em `aguardando_helder` sem resposta há 2 h úteis
 * (desde o último push, ou desde que passaram a aguardar) e marca `ultimo_push_em = agora`.
 * Fora do horário útil (seg–sex 7h–17h30, sem feriado) devolve lista vazia: nunca sai push fora da janela.
 * A contagem zera sozinha quando o evento sai de `aguardando_helder` (o Helder respondeu).
 */
type Ev = {
  id: number;
  robo: string;
  tipo: string;
  pv: string | null;
  cliente: string | null;
  resumo: string;
  acao_necessaria: string | null;
  aguardando_desde: string | null;
  ultimo_push_em: string | null;
  atualizado_em: string;
};

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request, "eventos.repetir_push", { skipRateLimit: true });
  if (!auth.ok) return auth.response;
  const agora = new Date();
  const feriados = await lerFeriados(auth.db);
  if (!dentroDoHorarioUtil(agora, feriados)) return apiOk({ itens: [], motivo: "fora do horário útil" });

  const { data, error } = await auth.db
    .from("eventos_hd")
    .select("id, robo, tipo, pv, cliente, resumo, acao_necessaria, aguardando_desde, ultimo_push_em, atualizado_em")
    .eq("tenant_id", auth.tenantId)
    .eq("severidade", "critico")
    .eq("status", "aguardando_helder")
    .order("id", { ascending: true })
    .limit(50);
  if (error) return apiError("Erro ao ler eventos: " + error.message, 500);

  const vencidos = ((data ?? []) as Ev[]).filter((e) => {
    const base = e.ultimo_push_em ?? e.aguardando_desde ?? e.atualizado_em;
    return minutosUteis(new Date(base), agora, feriados) >= INTERVALO_REPUSH_MIN;
  });
  if (vencidos.length) {
    const up = await auth.db
      .from("eventos_hd")
      .update({ ultimo_push_em: agora.toISOString() })
      .eq("tenant_id", auth.tenantId)
      .in("id", vencidos.map((e) => e.id));
    if (up.error) return apiError("Erro ao marcar o push: " + up.error.message, 500);
    await writeAuditLog(auth.db, {
      tenantId: auth.tenantId,
      agentId: auth.agent?.id ?? null,
      action: "eventos.repetir_push",
      outcome: "ok",
      input: { ids: vencidos.map((e) => e.id) },
    });
  }
  return apiOk({
    itens: vencidos.map((e) => ({
      id: e.id,
      robo: e.robo,
      tipo: e.tipo,
      pv: e.pv,
      cliente: e.cliente,
      resumo: e.resumo.slice(0, 600),
      acao_necessaria: e.acao_necessaria,
      aguardando_desde: e.aguardando_desde,
    })),
  });
}
