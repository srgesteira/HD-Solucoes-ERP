import { apiError, apiOk } from "@/modules/core/lib/http";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { writeAuditLog } from "@/modules/agent/lib/governance";
import { requireFreshMfa } from "@/modules/agent/lib/mfa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/learning/carga — refaz a carga "fornecedor de cada item" a partir dos pedidos de compra.
 * Só atualiza regra quando há PC mais novo. Diretor com MFA.
 */
export async function POST() {
  const gate = await requireFreshMfa();
  if (!gate.ok) return gate.response;
  const db = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await db.rpc("fn_robot_learning_seed_suppliers", { p_tenant: gate.tenantId });
  if (error) return apiError("Erro na carga: " + error.message, 500);
  await writeAuditLog(db, {
    tenantId: gate.tenantId,
    agentId: null,
    action: "learning.carga_fornecedores",
    outcome: "ok",
    actor: "diretor",
    result: { regras_novas_ou_atualizadas: Number(data ?? 0) },
  });
  return apiOk({ regras_novas_ou_atualizadas: Number(data ?? 0) });
}
