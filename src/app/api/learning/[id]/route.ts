import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { redactSecrets, writeAuditLog } from "@/modules/agent/lib/governance";
import { requireFreshMfa } from "@/modules/agent/lib/mfa";
import { formatLearning, LEARNING_COLS } from "@/modules/agent/lib/learning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Tela de regras do diretor (com MFA).
 * PATCH /api/learning/{id}  { pergunta?, resposta?, confirmar?: true }  → edita; editar ou confirmar renova os 6 meses
 * DELETE /api/learning/{id}                                             → apaga a regra (o robô volta a perguntar)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return apiError("Corpo JSON inválido.", 400);

  const patch: Record<string, unknown> = { source: "diretor", last_confirmed_at: new Date().toISOString() };
  if (typeof b.pergunta === "string" && b.pergunta.trim()) patch.original_question = b.pergunta.replace(/\s+/g, " ").trim().slice(0, 500);
  if (b.resposta !== undefined) {
    if (typeof b.resposta !== "object" || b.resposta === null || Array.isArray(b.resposta)) {
      return apiError("resposta deve ser um objeto.", 400);
    }
    patch.approved_answer = redactSecrets(b.resposta);
  }
  if (Object.keys(patch).length === 2 && b.confirmar !== true) return apiError("Nada para alterar.", 400);

  const db = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await db
    .from("robot_learning")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", gate.tenantId)
    .select(LEARNING_COLS)
    .maybeSingle();
  if (error) return apiError("Erro ao editar a regra: " + error.message, 500);
  if (!data) return apiError("Regra não encontrada.", 404);
  const r = formatLearning(data as unknown as Parameters<typeof formatLearning>[0]);
  await writeAuditLog(db, {
    tenantId: gate.tenantId,
    agentId: (data as { agent_id: string }).agent_id,
    action: b.confirmar === true && !patch.approved_answer ? "learning.confirmar" : "learning.editar",
    outcome: "ok",
    actor: "diretor",
    input: { id, contexto: r.contexto },
  });
  return apiOk(r);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await db
    .from("robot_learning")
    .delete()
    .eq("id", id)
    .eq("tenant_id", gate.tenantId)
    .select("id, agent_id, context")
    .maybeSingle();
  if (error) return apiError("Erro ao apagar a regra: " + error.message, 500);
  if (!data) return apiError("Regra não encontrada.", 404);
  await writeAuditLog(db, {
    tenantId: gate.tenantId,
    agentId: (data as { agent_id: string }).agent_id,
    action: "learning.apagar",
    outcome: "ok",
    actor: "diretor",
    input: { id, contexto: (data as { context: string }).context },
  });
  return apiOk({ apagada: true, id });
}
