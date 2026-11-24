import type { UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";
import type { NextResponse } from "next/server";

/** Fila de aprovações (Fase 4 — Módulo B): leitura e decisão compartilhadas pelas rotas. */

export const STATUS_APROVACAO = ["pendente", "aprovado", "rejeitado", "expirado"] as const;
export type StatusAprovacao = (typeof STATUS_APROVACAO)[number];

const COLS =
  "id, kind, summary, payload, source_url, risk, status, decided_by, decided_at, decision_note, expires_at, created_at, agent_id, agents(slug, name), user_profiles(full_name)";

type Row = {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
  source_url: string | null;
  risk: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  expires_at: string;
  created_at: string;
  agent_id: string;
  agents: { slug: string; name: string } | null;
  user_profiles: { full_name: string | null } | null;
};

export function formatApproval(r: Row) {
  return {
    id: r.id,
    tipo: r.kind,
    resumo: r.summary,
    dados: r.payload,
    origem_url: r.source_url,
    risco: r.risk,
    status: r.status,
    robo: r.agents?.slug ?? null,
    robo_nome: r.agents?.name ?? null,
    criado_em: r.created_at,
    expira_em: r.expires_at,
    decidido_em: r.decided_at,
    decidido_por: r.decided_by,
    decidido_por_nome: r.user_profiles?.full_name ?? null,
    observacao: r.decision_note,
  };
}

/** Regra das 18h: antes de qualquer leitura/decisão, o que venceu vira 'expirado'. */
export async function expirePending(db: UntypedAdmin, tenantId: string): Promise<number> {
  const { data } = await db.rpc("fn_approvals_expire", { p_tenant: tenantId });
  return Number(data ?? 0);
}

export async function listApprovals(
  db: UntypedAdmin,
  tenantId: string,
  f: { status?: string | null; agentId?: string | null; desde?: string | null; id?: string | null; limite?: number }
): Promise<NextResponse> {
  const expirados = await expirePending(db, tenantId);
  let q = db.from("approvals").select(COLS).eq("tenant_id", tenantId);
  if (f.id) q = q.eq("id", f.id);
  if (f.status) {
    if (!STATUS_APROVACAO.includes(f.status as StatusAprovacao)) return apiError("status inválido", 400);
    q = q.eq("status", f.status);
  }
  if (f.agentId) q = q.eq("agent_id", f.agentId);
  if (f.desde) {
    const d = new Date(f.desde);
    if (Number.isNaN(d.getTime())) return apiError("desde inválido (use data ISO)", 400);
    q = q.gte("created_at", d.toISOString());
  }
  const limite = Math.min(500, Math.max(1, f.limite ?? 100));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
  if (error) return apiError("Erro ao ler a fila: " + error.message, 500);
  const itens = ((data ?? []) as unknown as Row[]).map(formatApproval);
  return apiOk({ total: itens.length, expirados_agora: expirados, itens });
}

export async function decideApprovals(
  db: UntypedAdmin,
  tenantId: string,
  userId: string,
  ids: string[],
  decisao: string,
  nota: string | null
): Promise<NextResponse> {
  if (decisao !== "aprovado" && decisao !== "rejeitado") {
    return apiError('decisao deve ser "aprovado" ou "rejeitado".', 400);
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const limpos = [...new Set(ids.filter((x) => typeof x === "string" && UUID.test(x)))];
  if (!limpos.length) return apiError("Informe os ids dos pedidos.", 400);
  if (limpos.length > 100) return apiError("No máximo 100 pedidos por vez.", 400);
  const { data, error } = await db.rpc("fn_approvals_decide", {
    p_tenant: tenantId,
    p_ids: limpos,
    p_decision: decisao,
    p_user: userId,
    p_note: nota ? String(nota).slice(0, 500) : null,
  });
  if (error) return apiError("Erro ao decidir: " + error.message, 500);
  const decididos = (data ?? []) as Array<{ id: string; status: string; summary: string }>;
  const feitos = new Set(decididos.map((d) => d.id));
  return apiOk({
    decisao,
    decididos: decididos.length,
    itens: decididos,
    // Já decididos antes, expirados ou de outro tenant: não mudam (decisão é definitiva).
    ignorados: limpos.filter((id) => !feitos.has(id)),
  });
}
