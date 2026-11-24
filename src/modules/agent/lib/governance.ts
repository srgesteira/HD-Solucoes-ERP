import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin, type UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError } from "@/modules/core/lib/http";

/**
 * Governança dos robôs (Fase 4 — Módulos C e D).
 *
 * Autenticação de robô, em ordem:
 *   1. Token próprio do robô (Bearer hdr_...) → procurado pelo hash em `agents.token_hash`.
 *      Aplica no servidor: robô pausado, janela de horário (São Paulo) e limite de ações por hora.
 *      Toda recusa grava em `agent_audit_log` com outcome = 'recusado'.
 *   2. Chave única antiga (AGENT_API_KEY) — continua valendo durante a migração.
 *      O robô pode se identificar pelo header `x-robo: <slug>`; aí a pausa também vale para ele.
 *
 * Token nunca é gravado: só o hash SHA-256. Revogar = trocar o hash → o token antigo deixa de valer na hora.
 */

export const TOKEN_PREFIX = "hdr_";
const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export type AgentRow = {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  role: string;
  window_start: string;
  window_end: string;
  max_actions_per_hour: number;
  status: "ativo" | "pausado" | "erro";
  last_seen_at: string | null;
  token_rotated_at: string | null;
};

const AGENT_COLUMNS =
  "id, tenant_id, slug, name, role, window_start, window_end, max_actions_per_hour, status, last_seen_at, token_rotated_at";

export type AgentAuth =
  | { ok: true; tenantId: string; agent: AgentRow | null; via: "token" | "chave_legada"; db: UntypedAdmin }
  | { ok: false; response: NextResponse };

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateAgentToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value);
}

function bearer(request: NextRequest): string {
  return (request.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
}

function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Hora atual em São Paulo no formato HH:MM:SS (para comparar com colunas `time`). */
export function nowTimeSaoPaulo(d = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** Normaliza "7:00" / "07:00" / "07:00:00" para HH:MM:SS. */
function normTime(t: string): string {
  const [h = "0", m = "0", s = "0"] = String(t).split(":");
  return [h, m, s].map((x) => x.padStart(2, "0").slice(0, 2)).join(":");
}

export function isInsideWindow(agent: Pick<AgentRow, "window_start" | "window_end">, now = nowTimeSaoPaulo()): boolean {
  return now >= normTime(agent.window_start) && now < normTime(agent.window_end);
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */
/* ------------------------------------------------------------------ */

const SECRET_KEY = /(senha|password|passwd|token|secret|segredo|chave|api[_-]?key|authorization|cookie|bearer)/i;
const MAX_JSON_CHARS = 20_000;

/** Remove do JSON qualquer campo com cara de segredo (regra: nada de senha, token ou chave no log). */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 8) return "[profundidade máxima]";
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redactSecrets(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[removido]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    // Tokens soltos no texto (Bearer ..., hdr_...) também saem.
    return value.replace(/hdr_[A-Za-z0-9_-]{10,}/g, "[removido]").replace(/bearer\s+\S+/gi, "Bearer [removido]");
  }
  return value;
}

function boundedJson(value: unknown): unknown {
  if (value === undefined) return null;
  const clean = redactSecrets(value);
  const text = JSON.stringify(clean);
  if (text && text.length > MAX_JSON_CHARS) {
    return { truncado: true, tamanho_original: text.length, inicio: text.slice(0, MAX_JSON_CHARS) };
  }
  return clean;
}

export type AuditOutcome = "ok" | "erro" | "recusado" | "ignorado";
export type AuditActor = "robo" | "claude" | "diretor" | "sistema";

export type AuditEntry = {
  tenantId: string;
  agentId: string | null;
  action: string;
  outcome: AuditOutcome;
  actor?: AuditActor;
  input?: unknown;
  result?: unknown;
  durationMs?: number | null;
  error?: string | null;
  approvalId?: string | null;
};

/** Grava uma linha em agent_audit_log. Nunca lança: devolve a mensagem de erro, se houver. */
export async function writeAuditLog(db: UntypedAdmin, e: AuditEntry): Promise<{ id: number | null; error: string | null }> {
  const row = {
    tenant_id: e.tenantId,
    agent_id: e.agentId,
    actor: e.actor ?? "robo",
    action: String(e.action).slice(0, 120),
    input: boundedJson(e.input),
    result: boundedJson(e.result),
    outcome: e.outcome,
    duration_ms:
      typeof e.durationMs === "number" && Number.isFinite(e.durationMs) && e.durationMs >= 0
        ? Math.round(e.durationMs)
        : null,
    error: e.error ? String(redactSecrets(String(e.error))).slice(0, 2000) : null,
    approval_id: e.approvalId ?? null,
  };
  const { data, error } = await db.from("agent_audit_log").insert(row).select("id").single();
  if (error) return { id: null, error: error.message as string };
  return { id: (data?.id as number) ?? null, error: null };
}

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

async function firstTenantId(db: UntypedAdmin): Promise<string | null> {
  const { data } = await db.from("tenants").select("id").limit(1);
  return (data?.[0]?.id as string) ?? null;
}

async function countActionsLastHour(db: UntypedAdmin, agentId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("agent_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .in("outcome", ["ok", "erro"])
    .gte("created_at", since);
  return count ?? 0;
}

async function refuse(
  db: UntypedAdmin,
  agent: AgentRow,
  action: string,
  reason: string,
  status: number
): Promise<AgentAuth> {
  await writeAuditLog(db, {
    tenantId: agent.tenant_id,
    agentId: agent.id,
    action,
    outcome: "recusado",
    actor: "sistema",
    error: reason,
  });
  return { ok: false, response: apiError(reason, status) };
}

/** Pausa, janela e limite por hora — as travas do servidor para um robô identificado. */
async function enforceAgentRules(
  db: UntypedAdmin,
  agent: AgentRow,
  action: string,
  opts: { skipWindow?: boolean; skipRateLimit?: boolean }
): Promise<NextResponse | null> {
  if (agent.status === "pausado") {
    const r = await refuse(db, agent, action, `Robô ${agent.slug} está pausado.`, 423);
    return r.ok ? null : r.response;
  }
  if (!opts.skipWindow && !isInsideWindow(agent)) {
    const r = await refuse(
      db,
      agent,
      action,
      `Fora da janela do robô ${agent.slug} (${agent.window_start.slice(0, 5)}–${agent.window_end.slice(0, 5)}, São Paulo).`,
      403
    );
    return r.ok ? null : r.response;
  }
  if (!opts.skipRateLimit) {
    const used = await countActionsLastHour(db, agent.id);
    if (used >= agent.max_actions_per_hour) {
      const r = await refuse(
        db,
        agent,
        action,
        `Limite de ${agent.max_actions_per_hour} ações por hora atingido pelo robô ${agent.slug}.`,
        429
      );
      return r.ok ? null : r.response;
    }
  }
  return null;
}

/**
 * Autentica um robô.
 * @param action nome da ação (vai para o log quando a rota recusa)
 * @param opts.skipWindow / skipRateLimit — só para rotas de sinal de vida e leitura.
 */
export async function authenticateAgent(
  request: NextRequest,
  action: string,
  opts: { skipWindow?: boolean; skipRateLimit?: boolean } = {}
): Promise<AgentAuth> {
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const sent = bearer(request);
  if (!sent) return { ok: false, response: apiError("Não autorizado", 401) };

  // 1. Token próprio do robô
  if (sent.startsWith(TOKEN_PREFIX)) {
    const { data, error } = await db
      .from("agents")
      .select(AGENT_COLUMNS)
      .eq("token_hash", hashToken(sent))
      .maybeSingle();
    if (error) return { ok: false, response: apiError("Erro ao validar o robô.", 500) };
    if (!data) return { ok: false, response: apiError("Não autorizado (token inválido ou revogado).", 401) };
    const agent = data as AgentRow;
    const blocked = await enforceAgentRules(db, agent, action, opts);
    if (blocked) return { ok: false, response: blocked };
    await db.from("agents").update({ last_seen_at: new Date().toISOString() }).eq("id", agent.id);
    return { ok: true, tenantId: agent.tenant_id, agent, via: "token", db };
  }

  // 2. Chave única antiga
  const legacy = (process.env.AGENT_API_KEY ?? "").trim();
  if (!legacy || !sameSecret(sent, legacy)) return { ok: false, response: apiError("Não autorizado", 401) };

  const tenantId = await firstTenantId(db);
  if (!tenantId) return { ok: false, response: apiError("Tenant não encontrado", 403) };

  const hint = (request.headers.get("x-robo") ?? "").trim().toLowerCase();
  let agent: AgentRow | null = null;
  if (isValidSlug(hint)) {
    const { data } = await db
      .from("agents")
      .select(AGENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("slug", hint)
      .maybeSingle();
    agent = (data as AgentRow | null) ?? null;
    if (agent) {
      const blocked = await enforceAgentRules(db, agent, action, opts);
      if (blocked) return { ok: false, response: blocked };
      await db.from("agents").update({ last_seen_at: new Date().toISOString() }).eq("id", agent.id);
    }
  }
  return { ok: true, tenantId, agent, via: "chave_legada", db };
}

/** Busca um robô do tenant pelo slug (para a chave antiga informar o robô no corpo). */
export async function findAgentBySlug(db: UntypedAdmin, tenantId: string, slug: string): Promise<AgentRow | null> {
  if (!isValidSlug(slug)) return null;
  const { data } = await db
    .from("agents")
    .select(AGENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  return (data as AgentRow | null) ?? null;
}

export { AGENT_COLUMNS };

/* ------------------------------------------------------------------ */
/* Regra das 17h30 (Ordem 4)                                           */
/* ------------------------------------------------------------------ */

/** Depois deste horário (São Paulo) nenhum efeito novo para fora: envio, NF-e, compra, pagamento. */
export const CORTE_EFEITO_EXTERNO = "17:30:00";
/** Antes deste horário também não (nada de robô de madrugada). */
export const INICIO_EFEITO_EXTERNO = "07:00:00";

export function efeitoExternoPermitido(now = nowTimeSaoPaulo()): boolean {
  return now >= INICIO_EFEITO_EXTERNO && now < CORTE_EFEITO_EXTERNO;
}

/**
 * Trava de horário para ações com efeito fora da empresa, chamada pelos robôs.
 * Fora do horário: grava 'recusado' no log e devolve a resposta 403; dentro: devolve null.
 */
export async function travaEfeitoExterno(
  db: UntypedAdmin,
  tenantId: string,
  agentId: string | null,
  action: string,
  now = nowTimeSaoPaulo()
): Promise<NextResponse | null> {
  if (efeitoExternoPermitido(now)) return null;
  const motivo = `Regra das 17h30: nenhum envio, NF-e, compra ou pagamento entre 17:30 e 07:00 (agora ${now.slice(0, 5)}, São Paulo).`;
  await writeAuditLog(db, { tenantId, agentId, action, outcome: "recusado", actor: "sistema", error: motivo });
  return apiError(motivo, 403);
}

/**
 * Atalho para as rotas /api/agent/* com efeito externo: só trava quando quem chama é robô
 * (Authorization presente). O diretor logado na tela do ERP não é barrado.
 */
export async function travaEfeitoExternoDoRobo(
  request: NextRequest,
  tenantId: string,
  action: string
): Promise<NextResponse | null> {
  if (!bearer(request)) return null;
  if (efeitoExternoPermitido()) return null;
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const sent = bearer(request);
  let agentId: string | null = null;
  if (sent.startsWith(TOKEN_PREFIX)) {
    const { data } = await db.from("agents").select("id").eq("token_hash", hashToken(sent)).maybeSingle();
    agentId = (data?.id as string) ?? null;
  } else {
    const hint = (request.headers.get("x-robo") ?? "").trim().toLowerCase();
    agentId = (await findAgentBySlug(db, tenantId, hint))?.id ?? null;
  }
  return travaEfeitoExterno(db, tenantId, agentId, action);
}

/* ------------------------------------------------------------------ */
/* Fase 5 — log automático das rotas /api/agent/* chamadas por robô    */
/* ------------------------------------------------------------------ */

type Handler<C> = (request: NextRequest, ctx: C) => Promise<Response> | Response;

const CAMPOS_DO_LOG = ["acao", "pv", "limite", "dry_run", "modo", "conta", "etapa", "cliente_id", "fornecedor_id", "aprovacao_id"];

/**
 * Envolve o handler de uma rota de robô. Quando quem chama é robô (Authorization presente):
 *  - identifica o robô pelo token próprio, pelo cabeçalho x-robo ou pelo robô padrão da rota;
 *  - robô pausado → 423 e linha 'recusado' (killswitch vale também para a chave antiga);
 *  - depois da resposta, grava uma linha no log: ok (2xx), recusado (4xx), erro (5xx).
 * O diretor logado na tela passa direto, sem log.
 */
export function comLogDoRobo<C = unknown>(
  rota: string,
  roboPadrao: string | ((request: NextRequest) => string),
  handler: Handler<C>
): Handler<C> {
  return async (request: NextRequest, ctx: C) => {
    const sent = bearer(request);
    if (!sent) return handler(request, ctx);

    const t0 = Date.now();
    const db = asUntypedAdmin(createSupabaseAdminClient());
    let agent: AgentRow | null = null;
    let tenantId: string | null = null;
    try {
      if (sent.startsWith(TOKEN_PREFIX)) {
        const { data } = await db.from("agents").select(AGENT_COLUMNS).eq("token_hash", hashToken(sent)).maybeSingle();
        agent = (data as AgentRow | null) ?? null;
        tenantId = agent?.tenant_id ?? null;
      }
      if (!tenantId) {
        const { data } = await db.from("tenants").select("id").limit(1);
        tenantId = (data?.[0]?.id as string) ?? null;
      }
      if (!agent && tenantId) {
        const hint = (request.headers.get("x-robo") ?? "").trim().toLowerCase();
        const padrao = typeof roboPadrao === "function" ? roboPadrao(request) : roboPadrao;
        agent = (await findAgentBySlug(db, tenantId, hint || padrao)) ?? null;
      }
    } catch {
      /* identificar o robô é melhor esforço; a rota segue com a própria autenticação */
    }

    let entrada: Record<string, unknown> = { metodo: request.method };
    for (const [k, v] of request.nextUrl.searchParams) if (CAMPOS_DO_LOG.includes(k)) entrada[k] = v;
    if (request.method !== "GET") {
      const corpo = (await request.clone().json().catch(() => null)) as Record<string, unknown> | null;
      if (corpo && typeof corpo === "object") {
        for (const k of CAMPOS_DO_LOG) if (corpo[k] !== undefined) entrada[k] = corpo[k];
      }
    }
    entrada = redactSecrets(entrada) as Record<string, unknown>;
    const acao = `${rota}.${typeof entrada.acao === "string" && entrada.acao ? entrada.acao : request.method.toLowerCase()}`;

    if (agent?.status === "pausado" && tenantId) {
      const motivo = `Robô '${agent.slug}' está pausado (killswitch).`;
      await writeAuditLog(db, { tenantId, agentId: agent.id, action: acao, outcome: "recusado", error: motivo, input: entrada });
      return apiError(motivo, 423);
    }

    let res: Response;
    try {
      res = await handler(request, ctx);
    } catch (e) {
      if (tenantId) {
        await writeAuditLog(db, {
          tenantId,
          agentId: agent?.id ?? null,
          action: acao,
          outcome: "erro",
          error: e instanceof Error ? e.message : "Erro inesperado",
          input: entrada,
          durationMs: Date.now() - t0,
        });
      }
      throw e;
    }

    if (tenantId) {
      const outcome = res.status >= 500 ? "erro" : res.status >= 400 ? "recusado" : "ok";
      let erro: string | null = null;
      if (res.status >= 400) {
        const txt = await res.clone().text().catch(() => "");
        try {
          erro = String((JSON.parse(txt) as { error?: string }).error ?? txt).slice(0, 300);
        } catch {
          erro = txt.slice(0, 300);
        }
      }
      if (agent && res.status < 400) {
        await db.from("agents").update({ last_seen_at: new Date().toISOString() }).eq("id", agent.id);
      }
      await writeAuditLog(db, {
        tenantId,
        agentId: agent?.id ?? null,
        action: acao,
        outcome,
        error: erro,
        input: entrada,
        result: { http: res.status },
        durationMs: Date.now() - t0,
      });
    }
    return res;
  };
}
