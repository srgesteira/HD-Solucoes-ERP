import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { authenticateAgent, findAgentBySlug, writeAuditLog } from "@/modules/agent/lib/governance";
import { classificar, TIPOS_APROVACAO, type TipoAprovacao } from "@/modules/agent/lib/risk-matrix";
import { criarAprovacao, listApprovals } from "@/modules/agent/lib/approvals";
import { requireFreshMfa } from "@/modules/agent/lib/mfa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Fila de aprovações (Fase 4 — Módulo B).
 *
 * POST /api/approvals  (robô: Bearer hdr_... ou chave antiga + "robo")
 *   { acao, resumo, tipo?, dados?, origem_url?, chave?, robo? }
 *   → o RISCO sai da matriz em código pela `acao` (nunca do robô). Ação fora da matriz = Alto.
 *     Ação Proibida entra como "pergunta" ao diretor. Baixo/Médio não entram (rodam automático),
 *     a não ser que tipo = "pergunta".
 *   → Risco Alto avisa o diretor por e-mail (só entre 07:00 e 17:30); o resto vai no resumo das 8h.
 *
 * GET /api/approvals?status=pendente&desde=ISO&id=&limite=
 *   → robô: vê os próprios pedidos (auditor e supervisor veem todos, para o resumo das 8h).
 *   → diretor: tela de Aprovações, com MFA.
 *   Antes de ler, o que passou das 18h vira 'expirado'.
 */

const LEITORES_GERAIS = new Set(["auditor", "supervisor"]);

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request, "approvals.criar", { skipWindow: true });
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return apiError("Corpo JSON inválido.", 400);

  const agent = auth.agent ?? (typeof b.robo === "string" ? await findAgentBySlug(db, tenantId, b.robo) : null);
  if (!agent) return apiError("Informe o robô (token próprio ou campo robo).", 400);

  const acao = typeof b.acao === "string" ? b.acao.trim() : "";
  if (!acao) return apiError("Informe acao (chave da matriz de risco, ex.: nfe.emitir).", 400);
  const resumo = typeof b.resumo === "string" ? b.resumo.replace(/\s+/g, " ").trim() : "";
  if (!resumo || resumo.length > 200) return apiError("resumo obrigatório, 1 linha, até 200 caracteres.", 400);

  const c = classificar(acao);
  let tipo: TipoAprovacao = c.tipo;
  if (typeof b.tipo === "string" && b.tipo) {
    if (!TIPOS_APROVACAO.includes(b.tipo as TipoAprovacao)) return apiError("tipo inválido.", 400);
    tipo = b.tipo as TipoAprovacao;
  }
  if (c.classe === "proibido") tipo = "pergunta";
  if ((c.classe === "baixo" || c.classe === "medio") && tipo !== "pergunta") {
    return apiError(`Ação "${c.acao}" é risco ${c.classe}: roda automático, não vai para a fila.`, 400);
  }

  let origem: string | null = null;
  if (typeof b.origem_url === "string" && b.origem_url.trim()) {
    origem = b.origem_url.trim();
    if (!/^https?:\/\//i.test(origem) || origem.length > 1000) return apiError("origem_url deve ser um link http(s).", 400);
  }

  try {
    const r = await criarAprovacao(db, tenantId, agent, {
      acao,
      resumo,
      tipo,
      dados: typeof b.dados === "object" && b.dados !== null && !Array.isArray(b.dados) ? (b.dados as Record<string, unknown>) : undefined,
      origem,
      chave: typeof b.chave === "string" && b.chave.trim() ? b.chave.trim().slice(0, 120) : null,
    });
    return apiOk(r, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar o pedido";
    await writeAuditLog(db, { tenantId, agentId: agent.id, action: "approvals.criar", outcome: "erro", error: msg, input: { acao, resumo } });
    return apiError(msg, 500);
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filtros = {
    status: sp.get("status"),
    desde: sp.get("desde"),
    id: sp.get("id"),
    limite: Number(sp.get("limite") ?? 100) || 100,
  };

  if ((request.headers.get("authorization") ?? "").trim()) {
    const auth = await authenticateAgent(request, "approvals.listar", { skipWindow: true, skipRateLimit: true });
    if (!auth.ok) return auth.response;
    const hint = (request.headers.get("x-robo") ?? sp.get("robo") ?? "").trim().toLowerCase();
    const agent = auth.agent ?? (hint ? await findAgentBySlug(auth.db, auth.tenantId, hint) : null);
    const geral = !agent || LEITORES_GERAIS.has(agent.slug);
    if (!agent && auth.via === "token") return apiError("Robô não identificado.", 400);
    return listApprovals(auth.db, auth.tenantId, { ...filtros, agentId: geral ? null : agent!.id });
  }

  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  return listApprovals(asUntypedAdmin(createSupabaseAdminClient()), gate.tenantId, filtros);
}
