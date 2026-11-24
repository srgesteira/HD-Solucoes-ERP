import { NextRequest } from "next/server";
import { expirePending } from "@/modules/agent/lib/approvals";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin, type UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  authenticateAgent,
  findAgentBySlug,
  isValidSlug,
  writeAuditLog,
  type AuditActor,
  type AuditOutcome,
} from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/audit — log de ações dos robôs (Fase 4, Módulo C). Tabela agent_audit_log (somente inclusão).
 *
 * POST  (robô: Bearer hdr_... ou chave antiga + header x-robo)
 *   { acao: "resumo_8h", situacao?: "ok"|"erro"|"ignorado", entrada?: {...}, resultado?: {...},
 *     duracao_ms?: 1234, erro?: "texto", ator?: "robo"|"claude", aprovacao_id?: "uuid", robo?: "slug" }
 *   → { ok: true, id }
 *   'recusado' não é aceito aqui: só o servidor grava recusa.
 *
 * GET   (robô ou administrador logado)
 *   ?robo=auditor &desde=2026-11-22 (ou ISO completo; padrão: últimas 24 h)
 *   &situacao=erro,recusado &limite=100 (máx. 500)
 *   → { itens: [...], resumo: { por_robo: { auditor: { ok: 3, erro: 1 } } } }
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES: AuditOutcome[] = ["ok", "erro", "recusado", "ignorado"];

export async function POST(request: NextRequest) {
  const started = Date.now();
  const auth = await authenticateAgent(request, "audit.gravar");
  if (!auth.ok) return auth.response;

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Corpo JSON inválido.", 400);
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return apiError("Corpo JSON inválido.", 400);

  const acao = typeof b.acao === "string" ? b.acao.trim() : "";
  if (!acao || acao.length > 120) return apiError("Informe 'acao' (texto de até 120 caracteres).", 400);

  const situacao = (typeof b.situacao === "string" ? b.situacao : "ok") as AuditOutcome;
  if (!["ok", "erro", "ignorado"].includes(situacao)) {
    return apiError("'situacao' deve ser ok, erro ou ignorado.", 400);
  }
  const erro = typeof b.erro === "string" ? b.erro.trim() : "";
  if (situacao === "erro" && !erro) return apiError("Com situacao = erro, informe 'erro'.", 400);

  const ator = (typeof b.ator === "string" ? b.ator : "robo") as AuditActor;
  if (!["robo", "claude"].includes(ator)) return apiError("'ator' deve ser robo ou claude.", 400);

  const aprovacao = typeof b.aprovacao_id === "string" ? b.aprovacao_id : null;
  if (aprovacao && !UUID.test(aprovacao)) return apiError("'aprovacao_id' inválido.", 400);

  // Robô: o do token; na chave antiga, o do header x-robo ou do campo 'robo'.
  let agent = auth.agent;
  if (!agent && isValidSlug(b.robo)) {
    agent = await findAgentBySlug(auth.db, auth.tenantId, b.robo);
    if (agent?.status === "pausado") {
      await writeAuditLog(auth.db, {
        tenantId: auth.tenantId,
        agentId: agent.id,
        action: "audit.gravar",
        outcome: "recusado",
        actor: "sistema",
        error: `Robô ${agent.slug} está pausado.`,
      });
      return apiError(`Robô ${agent.slug} está pausado.`, 423);
    }
  }

  const { id, error } = await writeAuditLog(auth.db, {
    tenantId: auth.tenantId,
    agentId: agent?.id ?? null,
    action: acao,
    outcome: situacao,
    actor: ator,
    input: b.entrada,
    result: b.resultado,
    durationMs: typeof b.duracao_ms === "number" ? b.duracao_ms : Date.now() - started,
    error: erro || null,
    approvalId: aprovacao,
  });
  if (error) return apiError("Erro ao gravar o log: " + error, 500);
  return apiOk({ ok: true, id, robo: agent?.slug ?? null }, 201);
}

async function resolveReader(request: NextRequest): Promise<{ db: UntypedAdmin; tenantId: string } | Response> {
  if ((request.headers.get("authorization") ?? "").trim()) {
    const auth = await authenticateAgent(request, "audit.ler", { skipWindow: true, skipRateLimit: true });
    if (!auth.ok) return auth.response;
    return { db: auth.db, tenantId: auth.tenantId };
  }
  if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);
  return { db: asUntypedAdmin(createSupabaseAdminClient()), tenantId };
}

export async function GET(request: NextRequest) {
  const reader = await resolveReader(request);
  if (reader instanceof Response) return reader;
  const { db, tenantId } = reader;
  const sp = request.nextUrl.searchParams;

  const limite = Math.min(Math.max(Number(sp.get("limite") ?? 100) || 100, 1), 500);

  const desdeRaw = (sp.get("desde") ?? "").trim();
  let desde: string;
  if (desdeRaw) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(desdeRaw)
      ? new Date(`${desdeRaw}T00:00:00-03:00`)
      : new Date(desdeRaw);
    if (Number.isNaN(d.getTime())) return apiError("'desde' inválido (use AAAA-MM-DD ou data ISO).", 400);
    desde = d.toISOString();
  } else {
    desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }

  let query = db
    .from("agent_audit_log")
    .select("id, created_at, actor, action, outcome, duration_ms, error, input, result, approval_id, agents(slug, name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(limite);

  const robo = (sp.get("robo") ?? "").trim().toLowerCase();
  if (robo) {
    const agent = await findAgentBySlug(db, tenantId, robo);
    if (!agent) return apiError(`Robô '${robo}' não encontrado.`, 404);
    query = query.eq("agent_id", agent.id);
  }

  const situacoes = (sp.get("situacao") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AuditOutcome[];
  if (situacoes.some((s) => !OUTCOMES.includes(s))) {
    return apiError("'situacao' aceita: ok, erro, recusado, ignorado (separados por vírgula).", 400);
  }
  if (situacoes.length) query = query.in("outcome", situacoes);

  const { data, error } = await query;
  if (error) return apiError("Erro ao ler o log: " + error.message, 500);

  type Row = {
    id: number;
    created_at: string;
    actor: string;
    action: string;
    outcome: AuditOutcome;
    duration_ms: number | null;
    error: string | null;
    input: unknown;
    result: unknown;
    approval_id: string | null;
    agents: { slug: string; name: string } | null;
  };
  const itens = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    quando: r.created_at,
    robo: r.agents?.slug ?? null,
    ator: r.actor,
    acao: r.action,
    situacao: r.outcome,
    duracao_ms: r.duration_ms,
    erro: r.error,
    entrada: r.input,
    resultado: r.result,
    aprovacao_id: r.approval_id,
  }));

  const porRobo: Record<string, Partial<Record<AuditOutcome, number>>> = {};
  for (const i of itens) {
    const k = i.robo ?? "(sem robô)";
    porRobo[k] ??= {};
    porRobo[k][i.situacao] = (porRobo[k][i.situacao] ?? 0) + 1;
  }

  // ?incluir=manha → o que o Auditor das 8h precisa além do log: fila de aprovações
  // (pendentes e expiradas desde `desde`) e o último alerta financeiro das 7h.
  let manha: Record<string, unknown> | undefined;
  if ((sp.get("incluir") ?? "").split(",").includes("manha")) {
    await expirePending(db, tenantId);
    const cols = "id, kind, summary, risk, status, created_at, expires_at, decided_at, agents(slug, name)";
    const [pend, exp, alerta, contagem, robos] = await Promise.all([
      db.from("approvals").select(cols).eq("tenant_id", tenantId).eq("status", "pendente").order("created_at").limit(50),
      db
        .from("approvals")
        .select(cols)
        .eq("tenant_id", tenantId)
        .eq("status", "expirado")
        .gte("decided_at", desde)
        .order("created_at")
        .limit(50),
      db
        .from("agent_audit_log")
        .select("created_at, result, agents!inner(slug)")
        .eq("tenant_id", tenantId)
        .eq("action", "alerta_financeiro")
        .eq("outcome", "ok")
        .eq("agents.slug", "alertas_financeiros")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(1),
      db
        .from("agent_audit_log")
        .select("outcome, agents(slug, name)")
        .eq("tenant_id", tenantId)
        .gte("created_at", desde)
        .limit(5000),
      db.from("agents").select("slug, name, status, last_seen_at").eq("tenant_id", tenantId).order("slug"),
    ]);
    // Fase 6 — o que rodou, por robô, desde `desde`.
    const rodou: Record<string, Partial<Record<AuditOutcome, number>>> = {};
    for (const r of (contagem.data ?? []) as Array<{ outcome: AuditOutcome; agents: { slug: string; name: string } | null }>) {
      const k = r.agents?.name ?? r.agents?.slug ?? "(sem robô)";
      rodou[k] ??= {};
      rodou[k][r.outcome] = (rodou[k][r.outcome] ?? 0) + 1;
    }
    const registro = ((robos.data ?? []) as Array<{ slug: string; name: string; status: string; last_seen_at: string | null }>).map((a) => ({
      robo: a.slug,
      nome: a.name,
      status: a.status,
      ultimo_sinal: a.last_seen_at,
    }));
    type Ap = { id: string; kind: string; summary: string; risk: string; created_at: string; agents: { slug: string; name: string } | null };
    const fmt = (rows: unknown) =>
      ((rows ?? []) as Ap[]).map((a) => ({ id: a.id, tipo: a.kind, resumo: a.summary, risco: a.risk, robo: a.agents?.name ?? a.agents?.slug ?? null, criado_em: a.created_at }));
    const al = ((alerta.data ?? []) as Array<{ created_at: string; result: Record<string, unknown> | null }>)[0];
    manha = {
      rodou,
      robos: registro,
      aprovacoes_pendentes: fmt(pend.data),
      aprovacoes_expiradas: fmt(exp.data),
      alerta_financeiro: al
        ? { quando: al.created_at, colisao_caixa: al.result?.colisao_caixa ?? null, texto: al.result?.texto ?? null }
        : null,
    };
  }

  return apiOk({ desde, total: itens.length, itens, resumo: { por_robo: porRobo }, ...(manha ? { manha } : {}) });
}
