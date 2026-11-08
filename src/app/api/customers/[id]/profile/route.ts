import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { CUSTOMER_PROFILE_FIELDS } from "@/modules/crm/lib/crm-entities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Ficha completa do cliente: cadastro + perfil fiscal calculado + contatos + oportunidades + últimas atividades. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const [c, tax, contacts, opps, acts, orders] = await Promise.all([
    admin.from("customers").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    admin.from("customer_tax_profile").select("*").eq("customer_id", id).maybeSingle(),
    admin.from("crm_contacts").select("*").eq("tenant_id", tenantId).eq("customer_id", id).order("name"),
    admin.from("crm_opportunities").select("*").eq("tenant_id", tenantId).eq("customer_id", id).order("updated_at", { ascending: false }),
    admin.from("crm_activities").select("*").eq("tenant_id", tenantId).eq("customer_id", id).order("occurred_at", { ascending: false }).limit(30),
    admin
      .from("sales_orders")
      .select("id, order_number, order_date, status, total")
      .eq("tenant_id", tenantId)
      .eq("customer_id", id)
      .order("order_date", { ascending: false })
      .limit(20),
  ]);
  if (c.error) return apiError(c.error.message, 500);
  if (!c.data) return apiError("Cliente não encontrado", 404);
  return apiOk({
    customer: c.data,
    tax: tax.data ?? null,
    contacts: contacts.data ?? [],
    opportunities: opps.data ?? [],
    activities: acts.data ?? [],
    orders: orders.data ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const access = await assertMenuModuleAccess("vendas");
  if (!access.ok) return access.response;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("Body inválido", 400);
  const patch: Record<string, unknown> = {};
  for (const f of CUSTOMER_PROFILE_FIELDS) {
    if (f in body) {
      const v = body[f];
      patch[f] = typeof v === "string" && v.trim() === "" ? null : v;
    }
  }
  if (typeof patch.address_state === "string") patch.address_state = patch.address_state.toUpperCase().slice(0, 2);
  if (!Object.keys(patch).length) return apiError("Nada para alterar", 400);
  const admin = asUntypedAdmin(createSupabaseAdminClient());
  const { data, error } = await admin
    .from("customers")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) return apiError(error.message, error.code === "23505" ? 409 : 400);
  if (!data) return apiError("Cliente não encontrado", 404);
  return apiOk({ data });
}
