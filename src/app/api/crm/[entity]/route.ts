import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { CRM_ENTITIES, isCrmEntity, pickFields } from "@/modules/crm/lib/crm-entities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ entity: string }> };

/**
 * GET  /api/crm/{contacts|opportunities|activities|reps}?customer_id=&stage=&open=1&limit=
 * POST /api/crm/{entity}  (campos da lista branca em crm-entities.ts)
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { entity } = await params;
  if (!isCrmEntity(entity)) return apiError("Entidade inválida", 404);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const cfg = CRM_ENTITIES[entity];
  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const select =
    entity === "opportunities"
      ? "*, customers(name, trade_name)"
      : entity === "activities"
        ? "*, customers(name, trade_name)"
        : "*";
  let q = admin.from(cfg.table).select(select).eq("tenant_id", tenantId);
  const customerId = sp.get("customer_id");
  if (customerId && entity !== "reps") q = q.eq("customer_id", customerId);
  const stage = sp.get("stage");
  if (stage && entity === "opportunities") q = q.eq("stage", stage);
  if (sp.get("open") === "1" && entity === "opportunities") q = q.not("stage", "in", "(ganho,perdido)");
  if (sp.get("open") === "1" && entity === "activities") q = q.eq("done", false);
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "100", 10) || 100));
  const asc = cfg.order === "name";
  const { data, error } = await q.order(cfg.order, { ascending: asc }).limit(limit);
  if (error) return apiError(error.message, 500);
  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { entity } = await params;
  if (!isCrmEntity(entity)) return apiError("Entidade inválida", 404);
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("Body inválido", 400);
  const row = pickFields(entity, body);
  for (const f of CRM_ENTITIES[entity].required) {
    if (row[f] == null || row[f] === "") return apiError(`Campo obrigatório: ${f}`, 400);
  }
  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin
    .from(CRM_ENTITIES[entity].table)
    .insert({ ...row, tenant_id: tenantId })
    .select()
    .single();
  if (error) return apiError(error.message, 400);
  return apiOk({ data }, 201);
}
