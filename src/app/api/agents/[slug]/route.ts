import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import {
  findAgentBySlug,
  generateAgentToken,
  hashToken,
  writeAuditLog,
} from "@/modules/agent/lib/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/agents/{slug} — gestão de um robô (Fase 4, Módulo D). Só administrador logado.
 *
 *   { acao: "pausar" }      → killswitch: as rotas do robô passam a recusar na hora.
 *   { acao: "retomar" }     → volta a 'ativo'.
 *   { acao: "novo_token" }  → gera token novo e invalida o anterior na hora.
 *                             O token aparece UMA vez nesta resposta; o banco guarda só o hash.
 *
 * Tudo grava em agent_audit_log com ator = 'diretor' (sem o token).
 */
type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await isCurrentUserTenantAdmin())) return apiError("Só o administrador pode gerir robôs.", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { slug } = await params;
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const agent = await findAgentBySlug(db, tenantId, String(slug ?? "").toLowerCase());
  if (!agent) return apiError(`Robô '${slug}' não encontrado.`, 404);

  let acao = "";
  try {
    const b = (await request.json()) as { acao?: unknown };
    acao = typeof b?.acao === "string" ? b.acao : "";
  } catch {
    /* sem corpo */
  }

  if (acao === "pausar" || acao === "retomar") {
    const status = acao === "pausar" ? "pausado" : "ativo";
    const { error } = await db.from("agents").update({ status }).eq("id", agent.id);
    if (error) return apiError("Erro ao atualizar o robô: " + error.message, 500);
    await writeAuditLog(db, {
      tenantId,
      agentId: agent.id,
      action: `agents.${acao}`,
      outcome: "ok",
      actor: "diretor",
      result: { status_anterior: agent.status, status_novo: status },
    });
    return apiOk({ ok: true, robo: agent.slug, status });
  }

  if (acao === "novo_token") {
    const token = generateAgentToken();
    const agora = new Date().toISOString();
    const { error } = await db
      .from("agents")
      .update({ token_hash: hashToken(token), token_rotated_at: agora })
      .eq("id", agent.id);
    if (error) return apiError("Erro ao gerar o token: " + error.message, 500);
    await writeAuditLog(db, {
      tenantId,
      agentId: agent.id,
      action: "agents.novo_token",
      outcome: "ok",
      actor: "diretor",
      result: { tinha_token: agent.token_rotated_at !== null, trocado_em: agora },
    });
    return apiOk({
      ok: true,
      robo: agent.slug,
      token,
      aviso: "Copie agora para a variável do n8n. Este token não será mostrado de novo; o anterior já não vale.",
    });
  }

  return apiError("acao inválida (use pausar, retomar ou novo_token).", 400);
}
