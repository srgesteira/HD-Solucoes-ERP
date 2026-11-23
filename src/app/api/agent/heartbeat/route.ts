import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { authenticateAgent, isValidSlug } from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/agent/heartbeat — o n8n avisa que está vivo (Robô 0, a cada 10 min).
 * Autorização: token do robô (Bearer hdr_...) ou chave antiga AGENT_API_KEY (sem sessão: máquina falando com máquina).
 * Corpo opcional: { robo?: "n8n", info?: { ... } }.
 * Grava/atualiza o último sinal em robot_heartbeats (lido por /api/status/n8n) e em agents.last_seen_at.
 * Sinal de vida não obedece janela nem limite por hora; robô pausado é recusado.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request, "heartbeat", { skipWindow: true, skipRateLimit: true });
  if (!auth.ok) return auth.response;

  let b: { robo?: unknown; info?: unknown } = {};
  try {
    b = await request.json();
  } catch {
    /* corpo vazio = n8n */
  }
  const robo = auth.agent?.slug ?? (isValidSlug(b.robo) ? b.robo : "n8n");
  const info = b.info && typeof b.info === "object" && !Array.isArray(b.info) ? b.info : {};
  const agora = new Date().toISOString();

  const { error } = await auth.db
    .from("robot_heartbeats")
    .upsert({ robot: robo, last_seen_at: agora, info }, { onConflict: "robot" });
  if (error) return apiError("Erro ao gravar o heartbeat: " + error.message, 500);

  // Registro dos robôs: mantém o último sinal (não falha o heartbeat se o robô não estiver cadastrado).
  await auth.db
    .from("agents")
    .update({ last_seen_at: agora })
    .eq("tenant_id", auth.tenantId)
    .eq("slug", robo)
    .neq("status", "pausado");

  return apiOk({ ok: true, robo, recebido_em: agora });
}
