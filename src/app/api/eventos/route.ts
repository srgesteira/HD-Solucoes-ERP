import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { authenticateAgent, findAgentBySlug, isValidSlug, writeAuditLog, type AgentAuth } from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/eventos — fila única de eventos dos robôs (Etapa 3.2). Tabela eventos_hd.
 *
 * POST (robô: Bearer hdr_... ou chave antiga + header x-robo)
 *   { robo, tipo, severidade?: "critico"|"medio"|"baixo", resumo, dedupe_key,
 *     cliente?, pv?, payload?, acao_necessaria?, prazo? (ISO), origem? }
 *   → 201 { ok, id, duplicado: false }
 *   → 200 { ok, id, duplicado: true }  quando já existe evento ABERTO com a mesma dedupe_key
 *     (o índice único parcial garante isso também para dois envios ao mesmo tempo).
 *
 * PATCH (robô ou HD Central) { id, status, hd_central_sessao?, tentativas_mais?: 1 }
 *   status: em_atendimento | aguardando_helder | falha_hd_central | resolvido | descartado
 *
 * GET ?status=aberto,falha_hd_central &limite=100 → { itens }
 * Tudo grava no /api/audit (agent_audit_log).
 */

const SEVERIDADES = ["critico", "medio", "baixo"];
const STATUS_PATCH = ["em_atendimento", "aguardando_helder", "falha_hd_central", "resolvido", "descartado"];
const ABERTOS = ["aberto", "em_atendimento", "aguardando_helder", "falha_hd_central"];

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function agenteDo(auth: Extract<AgentAuth, { ok: true }>, robo: unknown) {
  if (auth.agent) return auth.agent;
  return isValidSlug(robo) ? await findAgentBySlug(auth.db, auth.tenantId, robo) : null;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  // skipWindow: o robô pode ABRIR evento fora da janela; quem age é a HD Central, que respeita 7h–17h30.
  const auth = await authenticateAgent(request, "eventos.abrir", { skipWindow: true });
  if (!auth.ok) return auth.response;

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Corpo JSON inválido.", 400);
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return apiError("Corpo JSON inválido.", 400);

  const robo = txt(b.robo, 40).toLowerCase();
  const tipo = txt(b.tipo, 60);
  const resumo = txt(b.resumo, 4000);
  const dedupe = txt(b.dedupe_key, 200);
  const severidade = txt(b.severidade, 10) || "medio";
  if (!robo || !tipo || !resumo || !dedupe) return apiError("Informe robo, tipo, resumo e dedupe_key.", 400);
  if (!SEVERIDADES.includes(severidade)) return apiError("'severidade' deve ser critico, medio ou baixo.", 400);
  let prazo: string | null = null;
  if (b.prazo != null) {
    const d = new Date(String(b.prazo));
    if (Number.isNaN(d.getTime())) return apiError("'prazo' inválido (use data ISO).", 400);
    prazo = d.toISOString();
  }

  const agent = await agenteDo(auth, robo);
  const linha = {
    tenant_id: auth.tenantId,
    robo,
    tipo,
    severidade,
    resumo,
    dedupe_key: dedupe,
    cliente: txt(b.cliente, 200) || null,
    pv: txt(b.pv, 40) || null,
    payload: b.payload && typeof b.payload === "object" ? b.payload : {},
    acao_necessaria: txt(b.acao_necessaria, 1000) || null,
    prazo,
    origem: txt(b.origem, 120) || null,
  };

  const ins = await auth.db.from("eventos_hd").insert(linha).select("id").single();
  let id: number | null = (ins.data as { id: number } | null)?.id ?? null;
  let duplicado = false;

  if (ins.error) {
    // 23505 = unique_violation no índice parcial (já existe evento aberto com a mesma dedupe_key)
    if ((ins.error as { code?: string }).code !== "23505") return apiError("Erro ao gravar o evento: " + ins.error.message, 500);
    const ja = await auth.db
      .from("eventos_hd")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("dedupe_key", dedupe)
      .in("status", ABERTOS)
      .limit(1)
      .maybeSingle();
    id = (ja.data as { id: number } | null)?.id ?? null;
    duplicado = true;
  }

  await writeAuditLog(auth.db, {
    tenantId: auth.tenantId,
    agentId: agent?.id ?? null,
    action: duplicado ? "eventos.duplicado" : "eventos.abrir",
    outcome: duplicado ? "ignorado" : "ok",
    input: { robo, tipo, severidade, dedupe_key: dedupe, pv: linha.pv },
    result: { id, duplicado },
    durationMs: Date.now() - started,
  });

  return apiOk({ ok: true, id, duplicado }, duplicado ? 200 : 201);
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateAgent(request, "eventos.atualizar", { skipWindow: true });
  if (!auth.ok) return auth.response;
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Corpo JSON inválido.", 400);
  }
  const id = Number(b?.id);
  const status = txt(b?.status, 30);
  if (!Number.isInteger(id) || id <= 0) return apiError("Informe 'id'.", 400);
  if (!STATUS_PATCH.includes(status)) return apiError("'status' inválido: " + STATUS_PATCH.join(", "), 400);

  const atual = await auth.db.from("eventos_hd").select("id, tentativas").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();
  if (!atual.data) return apiError("Evento não encontrado.", 404);
  const mudanca: Record<string, unknown> = { status };
  if (typeof b.hd_central_sessao === "string") mudanca.hd_central_sessao = txt(b.hd_central_sessao, 200);
  if (b.tentativas_mais) mudanca.tentativas = ((atual.data as { tentativas: number }).tentativas ?? 0) + 1;
  if (status === "aguardando_helder") mudanca.ultimo_push_em = new Date().toISOString();

  const up = await auth.db.from("eventos_hd").update(mudanca).eq("tenant_id", auth.tenantId).eq("id", id);
  if (up.error) return apiError("Erro ao atualizar: " + up.error.message, 500);
  const agent = await agenteDo(auth, b?.robo);
  await writeAuditLog(auth.db, {
    tenantId: auth.tenantId,
    agentId: agent?.id ?? null,
    action: "eventos.status",
    outcome: "ok",
    input: { id, status },
  });
  return apiOk({ ok: true, id, status });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request, "eventos.ler", { skipWindow: true, skipRateLimit: true });
  if (!auth.ok) return auth.response;
  const sp = request.nextUrl.searchParams;
  const limite = Math.min(Math.max(Number(sp.get("limite") ?? 100) || 100, 1), 500);
  const status = (sp.get("status") ?? ABERTOS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const { data, error } = await auth.db
    .from("eventos_hd")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .in("status", status)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) return apiError("Erro ao ler eventos: " + error.message, 500);
  return apiOk({ total: data?.length ?? 0, itens: data ?? [] });
}
