import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { sendAuthorizedNfeEmail } from "@/modules/fiscal/lib/bling/send-nfe-status-email";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { orderId } = await params;
  const access = await assertMenuModuleAccess("faturamento");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let toOverride: string[] | undefined;
  try {
    const body = (await request.json().catch(() => null)) as {
      to?: unknown;
    } | null;
    if (body && Array.isArray(body.to)) {
      toOverride = body.to.filter((e): e is string => typeof e === "string");
    } else if (body && typeof body.to === "string" && body.to.trim()) {
      toOverride = body.to.split(/[\s;,]+/).map((e) => e.trim()).filter(Boolean);
    }
  } catch {
    toOverride = undefined;
  }

  const admin = createSupabaseAdminClient();
  const db = asUntypedAdmin(admin);
  const { data: nfeRaw, error } = await db
    .from("nfes")
    .select("id, status, created_at")
    .eq("tenant_id", tenantId)
    .eq("sales_order_id", orderId)
    .eq("status", "authorized")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  const nfe = nfeRaw as { id: string } | null;
  if (!nfe) {
    return apiError("Não há NF-e autorizada neste pedido para enviar.", 400);
  }

  try {
    const result = await sendAuthorizedNfeEmail(admin, tenantId, nfe.id, {
      force: true,
      toOverride,
    });
    return apiOk({ data: result });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Falha ao enviar DANFE/XML",
      500
    );
  }
}
