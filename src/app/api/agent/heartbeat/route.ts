import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { apiError, apiOk } from "@/modules/core/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/agent/heartbeat — o n8n avisa que está vivo (Robô 0, a cada 10 min).
 * Autorização: só Bearer AGENT_API_KEY (sem sessão: é máquina falando com máquina).
 * Corpo opcional: { robo?: "n8n", info?: { ... } }. Grava/atualiza o último sinal em robot_heartbeats.
 */
const NOME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export async function POST(request: NextRequest) {
  const key = (process.env.AGENT_API_KEY ?? "").trim();
  if (!key) return apiError("AGENT_API_KEY não configurada neste ambiente.", 503);
  const sent = (request.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
  if (sent !== key) return apiError("Não autorizado", 401);

  let b: { robo?: unknown; info?: unknown } = {};
  try {
    b = await request.json();
  } catch {
    /* corpo vazio = n8n */
  }
  const robo = typeof b.robo === "string" && NOME.test(b.robo) ? b.robo : "n8n";
  const info = b.info && typeof b.info === "object" && !Array.isArray(b.info) ? b.info : {};
  const agora = new Date().toISOString();

  const { error } = await asUntypedAdmin(createSupabaseAdminClient())
    .from("robot_heartbeats")
    .upsert({ robot: robo, last_seen_at: agora, info }, { onConflict: "robot" });
  if (error) return apiError("Erro ao gravar o heartbeat: " + error.message, 500);

  return apiOk({ ok: true, robo, recebido_em: agora });
}
