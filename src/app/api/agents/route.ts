import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin, type UntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { authenticateAgent, isInsideWindow } from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/agents — lista os robôs registrados (Fase 4, Módulo D).
 * Autorização: robô (Bearer hdr_... ou chave antiga) ou administrador logado.
 * Nunca devolve o hash do token; só se o robô já tem token próprio.
 *
 * Gestão (pausar, retomar, novo token): POST /api/agents/{slug} — só administrador.
 */
export async function GET(request: NextRequest) {
  let db: UntypedAdmin;
  let tenantId: string;

  if ((request.headers.get("authorization") ?? "").trim()) {
    const auth = await authenticateAgent(request, "agents.listar", { skipWindow: true, skipRateLimit: true });
    if (!auth.ok) return auth.response;
    db = auth.db;
    tenantId = auth.tenantId;
  } else {
    if (!(await isCurrentUserTenantAdmin())) return apiError("Não autorizado", 401);
    const t = await getCurrentTenantId();
    if (!t) return apiError("Tenant não encontrado", 403);
    db = asUntypedAdmin(createSupabaseAdminClient());
    tenantId = t;
  }

  const { data, error } = await db
    .from("agents")
    .select(
      "id, slug, name, role, status, window_start, window_end, max_actions_per_hour, last_seen_at, token_hash, token_rotated_at"
    )
    .eq("tenant_id", tenantId)
    .order("slug", { ascending: true });
  if (error) return apiError("Erro ao ler os robôs: " + error.message, 500);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from("agent_audit_log")
    .select("agent_id")
    .eq("tenant_id", tenantId)
    .in("outcome", ["ok", "erro"])
    .gte("created_at", since)
    .limit(5000);
  const perAgent = new Map<string, number>();
  for (const r of (recent ?? []) as { agent_id: string | null }[]) {
    if (r.agent_id) perAgent.set(r.agent_id, (perAgent.get(r.agent_id) ?? 0) + 1);
  }

  type Row = {
    id: string;
    slug: string;
    name: string;
    role: string;
    status: string;
    window_start: string;
    window_end: string;
    max_actions_per_hour: number;
    last_seen_at: string | null;
    token_hash: string | null;
    token_rotated_at: string | null;
  };
  const robos = ((data ?? []) as Row[]).map((a) => ({
    slug: a.slug,
    nome: a.name,
    funcao: a.role,
    status: a.status,
    janela: `${a.window_start.slice(0, 5)}–${a.window_end.slice(0, 5)}`,
    dentro_da_janela_agora: isInsideWindow(a),
    limite_por_hora: a.max_actions_per_hour,
    acoes_ultima_hora: perAgent.get(a.id) ?? 0,
    ultimo_sinal: a.last_seen_at,
    tem_token_proprio: Boolean(a.token_hash),
    token_trocado_em: a.token_rotated_at,
  }));

  return apiOk({ total: robos.length, robos });
}
