import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPcp =
    isAdmin ||
    (await currentUserCanModule("mrp")) ||
    (await currentUserCanModule("production"));
  if (!canPcp) return apiError("Sem permissão para alterar prazo PCP", 403);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (b.pcp_deadline === undefined) {
    return apiError("Nenhum campo para actualizar", 400);
  }

  const pcpDeadline =
    b.pcp_deadline === null ? null : String(b.pcp_deadline).slice(0, 10);

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("sales_order_items")
    .update({ pcp_deadline: pcpDeadline })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, pcp_deadline")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Linha não encontrada", 404);

  const { data: oi } = await admin
    .from("order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sales_order_item_id", id)
    .maybeSingle();

  if (oi?.id && pcpDeadline) {
    await admin
      .from("order_items")
      .update({ pcp_deadline: pcpDeadline })
      .eq("id", oi.id)
      .eq("tenant_id", tenantId);
  }

  return apiOk({ data });
}
