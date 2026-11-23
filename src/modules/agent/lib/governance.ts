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
