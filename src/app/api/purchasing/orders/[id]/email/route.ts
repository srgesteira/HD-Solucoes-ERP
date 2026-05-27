import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { fetchPurchaseOrderForExport } from "@/modules/compras/lib/purchasing/fetch-purchase-order-for-export";
import { sendPurchaseOrderEmail } from "@/modules/compras/lib/purchasing/send-purchase-order-email";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function appOrigin(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canPurchasing = await currentUserCanModule("purchasing");
  if (!isAdmin && !canPurchasing) {
    return apiError("Sem permissão", 403);
  }

  let toOverride: string[] | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && Array.isArray((body as { to?: unknown }).to)) {
      toOverride = (body as { to: string[] }).to.filter(
        (e): e is string => typeof e === "string"
      );
    }
  } catch {
    /* body opcional */
  }

  const admin = createSupabaseAdminClient();
  const order = await fetchPurchaseOrderForExport(admin, tenantId, id);
  if (!order) return apiError("Pedido não encontrado", 404);

  try {
    const result = await sendPurchaseOrderEmail({
      order,
      appOrigin: appOrigin(request),
      toOverride,
    });

    return apiOk({
      sent: result.sent,
      simulated: result.simulated ?? false,
      message: result.message ?? (result.sent ? "E-mail enviado." : "Envio não realizado."),
      warning: result.warning ?? null,
    });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Erro ao enviar e-mail",
      500
    );
  }
}
