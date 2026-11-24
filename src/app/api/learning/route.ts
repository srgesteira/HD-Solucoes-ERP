import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin, type UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { authenticateAgent, findAgentBySlug, redactSecrets, writeAuditLog } from "@/modules/agent/lib/governance";
import { requireFreshMfa } from "@/modules/agent/lib/mfa";
import { CONTEXTO_VALIDO, formatLearning, LEARNING_COLS, limiteValidade } from "@/modules/agent/lib/learning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Banco de aprendizado (Fase 4 — Módulo E).
 *
 * GET /api/learning?robo=comprador&contexto=fornecedor_item:<id>&busca=texto&limite=
 *   → robô: só regras VÁLIDAS (confirmadas nos últimos 6 meses) — fora disso, volta a perguntar.
 *     Sem `robo`, o robô vê as próprias regras.
 *   → diretor (tela, com MFA): todas, inclusive vencidas (?todas=1).
 *
 * POST /api/learning  { robo, contexto, pergunta, resposta: {..}, risco?, aprovacao_id? }
 *   → robô: só o HD Central (Claude) ensina, com fonte = 'claude'. Risco Alto exige aprovacao_id
 *     de um pedido APROVADO pelo diretor (regra de ouro 1). Nunca texto copiado de e-mail (regra 2).
 *   → diretor (com MFA): fonte = 'diretor'.
 *   Grava ou atualiza (mesmo robô + contexto) e renova a última confirmação.
 */

async function listar(db: UntypedAdmin, tenantId: string, sp: URLSearchParams, agentId: string | null, todas: boolean) {
  // Mesmo critério da view robot_learning_valid (6 meses), lido da tabela para trazer o nome do robô.
  let q = db.from("robot_learning").select(LEARNING_COLS).eq("tenant_id", tenantId);
  if (!todas) q = q.gt("last_confirmed_at", limiteValidade());
  if (agentId) q = q.eq("agent_id", agentId);
  const contexto = sp.get("contexto");
  if (contexto) q = contexto.endsWith("*") ? q.like("context", contexto.slice(0, -1) + "%") : q.eq("context", contexto);
  const busca = (sp.get("busca") ?? "").trim();
  if (busca) q = q.ilike("original_question", `%${busca.replace(/[%_]/g, "")}%`);
  const limite = Math.min(1000, Math.max(1, Number(sp.get("limite") ?? 200) || 200));
  const { data, error } = await q.order("last_confirmed_at", { ascending: false }).limit(limite);
  if (error) return apiError("Erro ao ler o banco de aprendizado: " + error.message, 500);
  const itens = ((data ?? []) as unknown as Parameters<typeof formatLearning>[0][]).map(formatLearning);
  return apiOk({ total: itens.length, itens });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if ((request.headers.get("authorization") ?? "").trim()) {
    const auth = await authenticateAgent(request, "learning.consultar", { skipWindow: true, skipRateLimit: true });
    if (!auth.ok) return auth.response;
    const slug = (sp.get("robo") ?? auth.agent?.slug ?? request.headers.get("x-robo") ?? "").trim().toLowerCase();
    const alvo = slug ? await findAgentBySlug(auth.db, auth.tenantId, slug) : null;
    if (!alvo) return apiError("Informe robo.", 400);
    return listar(auth.db, auth.tenantId, sp, alvo.id, false);
  }
  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const slug = (sp.get("robo") ?? "").trim().toLowerCase();
  const alvo = slug ? await findAgentBySlug(db, gate.tenantId, slug) : null;
  if (slug && !alvo) return apiError(`Robô '${slug}' não encontrado.`, 404);
  return listar(db, gate.tenantId, sp, alvo?.id ?? null, sp.get("todas") === "1");
}

export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return apiError("Corpo JSON inválido.", 400);

  let db: UntypedAdmin;
  let tenantId: string;
  let fonte: "claude" | "diretor";
  let autorId: string | null = null;

  if ((request.headers.get("authorization") ?? "").trim()) {
    const auth = await authenticateAgent(request, "learning.ensinar");
    if (!auth.ok) return auth.response;
    // Regra de ouro 2: só o HD Central (Claude) ensina pelo robô.
    if (auth.agent?.slug !== "hd_central") {
      return apiError("Só o HD Central (Claude) ou o diretor ensinam regras.", 403);
    }
    db = auth.db;
    tenantId = auth.tenantId;
    fonte = "claude";
    autorId = auth.agent.id;
  } else {
    const gate = await requireFreshMfa();
    if (!gate.ok) return gate.response;
    db = asUntypedAdmin(createSupabaseAdminClient());
    tenantId = gate.tenantId;
    fonte = "diretor";
  }

  const alvo = typeof b.robo === "string" ? await findAgentBySlug(db, tenantId, b.robo.toLowerCase()) : null;
  if (!alvo) return apiError("Informe robo (dono da regra).", 400);
  const contexto = typeof b.contexto === "string" ? b.contexto.trim() : "";
  if (!CONTEXTO_VALIDO.test(contexto)) return apiError("contexto no formato assunto:chave (ex.: fornecedor_item:<id>).", 400);
  const pergunta = typeof b.pergunta === "string" ? b.pergunta.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  if (!pergunta) return apiError("Informe pergunta.", 400);
  const resposta = b.resposta;
  if (typeof resposta !== "object" || resposta === null || Array.isArray(resposta)) {
    return apiError("resposta deve ser um objeto com a decisão (quem/qual), não texto livre.", 400);
  }
  const risco = typeof b.risco === "string" ? b.risco : "baixo";
  if (!["baixo", "medio", "alto"].includes(risco)) return apiError("risco inválido.", 400);
  const aprovacaoId = typeof b.aprovacao_id === "string" ? b.aprovacao_id : null;

  // Regra de ouro 1: resposta do Claude para risco Alto só vira regra com OK do diretor.
  if (fonte === "claude" && risco === "alto") {
    if (!aprovacaoId) return apiError("Risco Alto: informe aprovacao_id de um pedido aprovado pelo diretor.", 400);
    const { data: ap } = await db.from("approvals").select("status").eq("id", aprovacaoId).eq("tenant_id", tenantId).maybeSingle();
    if (ap?.status !== "aprovado") return apiError("O pedido informado não está aprovado.", 400);
  }

  const { data, error } = await db
    .from("robot_learning")
    .upsert(
      {
        tenant_id: tenantId,
        agent_id: alvo.id,
        context: contexto,
        original_question: pergunta,
        approved_answer: redactSecrets(resposta),
        source: fonte,
        risk: risco,
        approval_id: aprovacaoId,
        last_confirmed_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,agent_id,context" }
    )
    .select(LEARNING_COLS)
    .single();
  if (error) return apiError("Erro ao gravar a regra: " + error.message, 500);

  await writeAuditLog(db, {
    tenantId,
    agentId: autorId ?? alvo.id,
    action: "learning.ensinar",
    outcome: "ok",
    actor: fonte === "claude" ? "claude" : "diretor",
    input: { robo: alvo.slug, contexto, risco },
    approvalId: aprovacaoId,
  });
  return apiOk(formatLearning(data as unknown as Parameters<typeof formatLearning>[0]), 201);
}
