import type { NextRequest, NextResponse } from "next/server";
import { asUntypedAdmin, type UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { efeitoExternoPermitido, findAgentBySlug, redactSecrets, writeAuditLog } from "@/modules/agent/lib/governance";
import { classificar, riscoParaFila, type TipoAprovacao } from "@/modules/agent/lib/risk-matrix";
import { loadTenantMailConfig } from "@/shared/utils/email/load-tenant-mail-config";
import { sendMessage } from "@/modules/agent/lib/zoho-mailbox";

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

/* ------------------------------------------------------------------ */
/* Criar pedido na fila e exigir aprovação (Fase 5)                    */
/* ------------------------------------------------------------------ */

export type NovoPedido = {
  acao: string;
  resumo: string;
  tipo?: TipoAprovacao;
  dados?: Record<string, unknown>;
  origem?: string | null;
  /** Identifica o objeto (ex.: "PV-2026-0031"): um pedido aprovado só vale para a mesma chave. */
  chave?: string | null;
};

/** Cria o pedido na fila (risco pela matriz) e avisa o diretor por e-mail se for Alto e estiver no horário. */
export async function criarAprovacao(db: UntypedAdmin, tenantId: string, agent: { id: string; name: string }, p: NovoPedido) {
  const c = classificar(p.acao);
  const tipo: TipoAprovacao = c.classe === "proibido" ? "pergunta" : p.tipo ?? c.tipo;
  const risco = riscoParaFila(c);
  const resumo = p.resumo.replace(/\s+/g, " ").trim().slice(0, 200);
  const dados = {
    ...(p.dados ? (redactSecrets(p.dados) as object) : {}),
    _matriz: { acao: c.acao, classe: c.classe, descricao: c.descricao, fora_da_matriz: c.desconhecida },
    ...(p.chave ? { _chave: p.chave } : {}),
  };
  const { data, error } = await db
    .from("approvals")
    .insert({ tenant_id: tenantId, agent_id: agent.id, kind: tipo, summary: resumo, payload: dados, source_url: p.origem ?? null, risk: risco })
    .select("id, status, risk, kind, expires_at")
    .single();
  if (error) throw new Error("Erro ao criar o pedido: " + error.message);

  let avisado = false;
  if (risco === "alto" && efeitoExternoPermitido()) {
    try {
      const cfg = await loadTenantMailConfig(createSupabaseAdminClient(), tenantId);
      const para = cfg?.from ? String(cfg.from).match(/[^\s<>"]+@[^\s<>"]+/)?.[0] : null;
      if (cfg && para) {
        const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://hd-solucoes-erp.vercel.app").replace(/\/$/, "");
        await sendMessage(cfg, {
          to: [para],
          subject: `[Aprovação] ${agent.name}: ${resumo}`.slice(0, 180),
          text: `Pedido novo de risco Alto na fila.\n\nRobô: ${agent.name}\nTipo: ${tipo}\nResumo: ${resumo}${p.origem ? `\nOrigem: ${p.origem}` : ""}\n\nAprovar ou rejeitar: ${base}/aprovacoes\n\nVale até as 18h de hoje; depois vira expirado e volta no resumo das 8h.`,
        });
        avisado = true;
      }
    } catch {
      /* aviso é melhor esforço */
    }
  }

  await writeAuditLog(db, {
    tenantId,
    agentId: agent.id,
    action: "approvals.criar",
    outcome: "ok",
    input: { acao: c.acao, tipo, resumo, chave: p.chave ?? null },
    result: { id: data.id, risco, diretor_avisado: avisado },
    approvalId: data.id as string,
  });

  return {
    id: data.id as string,
    status: data.status as string,
    risco: data.risk as string,
    tipo: data.kind as string,
    expira_em: data.expires_at as string,
    classe_na_matriz: c.classe,
    fora_da_matriz: c.desconhecida,
    diretor_avisado: avisado,
  };
}

/** Aprovação usada para executar vale por 24 h depois da decisão. */
const VALIDADE_APROVADO_MS = 24 * 60 * 60 * 1000;

/**
 * Trava de aprovação para ações de risco Alto chamadas por ROBÔ (Fase 5).
 *  - Diretor logado (sem Authorization) passa direto: ele mesmo está decidindo.
 *  - Robô com `aprovacao_id` de um pedido APROVADO (mesma chave e ação, decidido há até 24 h) → segue.
 *  - Robô sem aprovação → cria o pedido na fila (ou reaproveita o pendente da mesma chave) e devolve 202.
 */
export async function exigirAprovacao(
  request: NextRequest,
  tenantId: string,
  roboSlug: string,
  aprovacaoId: unknown,
  p: NovoPedido & { acoesAceitas?: string[] }
): Promise<{ ok: true; approvalId: string | null } | { ok: false; response: NextResponse }> {
  if (!(request.headers.get("authorization") ?? "").trim()) return { ok: true, approvalId: null };

  const db = asUntypedAdmin(createSupabaseAdminClient());
  const hint = (request.headers.get("x-robo") ?? "").trim().toLowerCase();
  const agent = (await findAgentBySlug(db, tenantId, hint || roboSlug)) ?? (await findAgentBySlug(db, tenantId, roboSlug));
  if (!agent) return { ok: false, response: apiError(`Robô '${roboSlug}' não cadastrado.`, 400) };
  const aceitas = new Set([p.acao, ...(p.acoesAceitas ?? [])].map((a) => a.toLowerCase()));

  if (typeof aprovacaoId === "string" && aprovacaoId.trim()) {
    const { data: ap } = await db
      .from("approvals")
      .select("id, status, payload, decided_at")
      .eq("id", aprovacaoId.trim())
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const payload = (ap?.payload ?? {}) as { _chave?: string; _matriz?: { acao?: string } };
    const motivo = !ap
      ? "pedido de aprovação não encontrado"
      : ap.status !== "aprovado"
        ? `pedido está '${ap.status}', não aprovado`
        : p.chave && payload._chave !== p.chave
          ? `aprovação é de ${payload._chave ?? "outro item"}, não de ${p.chave}`
          : !aceitas.has(String(payload._matriz?.acao ?? "").toLowerCase())
            ? `aprovação é para '${payload._matriz?.acao ?? "?"}', não para '${p.acao}'`
            : ap.decided_at && Date.now() - new Date(ap.decided_at as string).getTime() > VALIDADE_APROVADO_MS
              ? "aprovação tem mais de 24 h; peça de novo"
              : null;
    if (motivo) {
      await writeAuditLog(db, { tenantId, agentId: agent.id, action: `aprovacao.usar`, outcome: "recusado", error: motivo, approvalId: ap?.id ?? null });
      return { ok: false, response: apiError(`Não executado: ${motivo}.`, 403) };
    }
    return { ok: true, approvalId: ap!.id as string };
  }

  // Sem aprovação: reaproveita o pedido pendente da mesma chave/ação ou cria um novo.
  await expirePending(db, tenantId);
  if (p.chave) {
    const { data: pend } = await db
      .from("approvals")
      .select("id, payload, expires_at")
      .eq("tenant_id", tenantId)
      .eq("status", "pendente")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const igual = ((pend ?? []) as Array<{ id: string; payload: { _chave?: string; _matriz?: { acao?: string } }; expires_at: string }>).find(
      (a) => a.payload?._chave === p.chave && aceitas.has(String(a.payload?._matriz?.acao ?? "").toLowerCase())
    );
    if (igual) {
      return {
        ok: false,
        response: apiOk(
          { aguardando_aprovacao: true, aprovacao_id: igual.id, expira_em: igual.expires_at, mensagem: "Já está na fila do diretor. Depois de aprovado, chame de novo com aprovacao_id." },
          202
        ),
      };
    }
  }
  const novo = await criarAprovacao(db, tenantId, agent, p);
  return {
    ok: false,
    response: apiOk(
      { aguardando_aprovacao: true, aprovacao_id: novo.id, expira_em: novo.expira_em, risco: novo.risco, mensagem: "Pedido criado na fila do diretor. Depois de aprovado, chame de novo com aprovacao_id." },
      202
    ),
  };
}
