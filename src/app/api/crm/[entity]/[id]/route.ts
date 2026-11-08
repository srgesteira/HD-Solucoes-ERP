import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { CRM_ENTITIES, isCrmEntity, pickFields } from "@/modules/crm/lib/crm-entities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { entity, id } = await params;
  if (!isCrmEntity(entity)) return apiError("Entidade inválida", 404);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("Body inválido", 400);
  const patch = pickFields(entity, body);
  if (!Object.keys(patch).length) return apiError("Nada para alterar", 400);
  if (entity === "opportunities" && (patch.stage === "ganho" || patch.stage === "perdido") && !("closed_at" in patch)) {
    patch.closed_at = new Date().toISOString().slice(0, 10);
  }
  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin
    .from(CRM_ENTITIES[entity].table)
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Não encontrado", 404);
  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { entity, id } = await params;
  if (!isCrmEntity(entity) || entity === "reps") return apiError("Entidade inválida", 404);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);
  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { error } = await admin.from(CRM_ENTITIES[entity].table).delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return apiError(error.message, 400);
  return apiOk({ ok: true });
}
