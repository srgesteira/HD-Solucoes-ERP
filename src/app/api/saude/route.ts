import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin, type UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { authenticateAgent } from "@/modules/agent/lib/governance";
import { LIMITE_AGUARDANDO_MIN, minutosUteis } from "@/modules/agent/lib/tempo-util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/saude — painel de saúde dos robôs (Etapa 6.1). Administrador logado ou robô (Bearer).
 * Último sinal e erros em 24 h por robô, eventos por status (com "aguardando Helder" após 10h30 úteis),
 * aprovações pendentes/vencidas e a última resposta da HD Central.
 */
async function leitor(request: NextRequest): Promise<{ db: UntypedAdmin; tenantId: string } | Response> {
  if ((request.headers.get("authorization") ?? "").trim()) {
    const auth = await authenticateAgent(request, "saude.ler", { skipWindow: true, skipRateLimit: true });
    if (!auth.ok) return auth.response;
    return { db: auth.db, tenantId: auth.tenantId };
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);
  return { db: asUntypedAdmin(createSupabaseAdminClient()), tenantId };
}

type Evento = {
  id: number;
  criado_em: string;
  atualizado_em: string;
  robo: string;
  tipo: string;
  severidade: string;
  pv: string | null;
  cliente: string | null;
  resumo: string;
  status: string;
  aguardando_desde: string | null;
  tentativas: number;
};

export async function GET(request: NextRequest) {
  const l = await leitor(request);
  if (l instanceof Response) return l;
  const { db, tenantId } = l;
  const agora = new Date();
  const desde24h = new Date(agora.getTime() - 24 * 3600 * 1000).toISOString();

  const [robos, log, eventos, aprov, hdCentral] = await Promise.all([
    db.from("agents").select("slug, name, status, last_seen_at").eq("tenant_id", tenantId).order("slug"),
    db.from("agent_audit_log").select("outcome, created_at, agents(slug)").eq("tenant_id", tenantId).gte("created_at", desde24h).limit(5000),
    db
      .from("eventos_hd")
      .select("id, criado_em, atualizado_em, robo, tipo, severidade, pv, cliente, resumo, status, aguardando_desde, tentativas")
      .eq("tenant_id", tenantId)
      .or(`status.in.(aberto,em_atendimento,aguardando_helder,falha_hd_central),atualizado_em.gte.${desde24h}`)
      .order("criado_em", { ascending: false })
      .limit(300),
    db.from("approvals").select("status, created_at, decided_at").eq("tenant_id", tenantId).in("status", ["pendente", "expirado"]).gte("created_at", new Date(agora.getTime() - 7 * 24 * 3600 * 1000).toISOString()).limit(500),
    db.from("eventos_hd").select("atualizado_em").eq("tenant_id", tenantId).in("status", ["em_atendimento", "resolvido", "aguardando_helder"]).order("atualizado_em", { ascending: false }).limit(1),
  ]);

  const porRobo: Record<string, { ok: number; erro: number; recusado: number; ultimo_ok: string | null }> = {};
  for (const r of (log.data ?? []) as Array<{ outcome: string; created_at: string; agents: { slug: string } | null }>) {
    const k = r.agents?.slug ?? "(sem robô)";
    porRobo[k] ??= { ok: 0, erro: 0, recusado: 0, ultimo_ok: null };
    if (r.outcome === "ok") {
      porRobo[k].ok++;
      if (!porRobo[k].ultimo_ok || r.created_at > porRobo[k].ultimo_ok!) porRobo[k].ultimo_ok = r.created_at;
    } else if (r.outcome === "erro") porRobo[k].erro++;
    else if (r.outcome === "recusado") porRobo[k].recusado++;
  }

  const lista = ((eventos.data ?? []) as Evento[]).map((e) => {
    const espera = e.status === "aguardando_helder" && e.aguardando_desde ? minutosUteis(new Date(e.aguardando_desde), agora) : null;
    return { ...e, minutos_uteis_aguardando: espera, aguardando_helder_vencido: espera !== null && espera >= LIMITE_AGUARDANDO_MIN };
  });
  const contagem: Record<string, number> = {};
  for (const e of lista) contagem[e.status] = (contagem[e.status] ?? 0) + 1;

  const ap = (aprov.data ?? []) as Array<{ status: string; decided_at: string | null }>;
  return apiOk({
    agora: agora.toISOString(),
    robos: ((robos.data ?? []) as Array<{ slug: string; name: string; status: string; last_seen_at: string | null }>).map((r) => ({
      ...r,
      ...(porRobo[r.slug] ?? { ok: 0, erro: 0, recusado: 0, ultimo_ok: null }),
    })),
    eventos: { contagem, itens: lista.slice(0, 100) },
    aprovacoes: {
      pendentes: ap.filter((a) => a.status === "pendente").length,
      vencidas_7d: ap.filter((a) => a.status === "expirado").length,
    },
    hd_central_ultima_resposta: ((hdCentral.data ?? []) as Array<{ atualizado_em: string }>)[0]?.atualizado_em ?? null,
    healthchecks: "https://healthchecks.io/",
  });
}
