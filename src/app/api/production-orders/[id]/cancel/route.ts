import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { cancelProductionOrder } from "@/modules/reverse/lib/production-cancellation-service";
import {
  PRODUCTION_CANCELLATION_REASONS,
  type ProductionCancellationReason,
} from "@/modules/reverse/lib/returns-types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem cancelar OP.", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    /* opcional */
  }

  const reasonRaw = String(body.reason ?? "");
  if (!(PRODUCTION_CANCELLATION_REASONS as readonly string[]).includes(reasonRaw)) {
    return apiError("Motivo inválido", 400);
  }
  const reason = reasonRaw as ProductionCancellationReason;
  const notes = typeof body.notes === "string" ? body.notes.trim() : null;

  try {
    const admin = createSupabaseAdminClient();
    await cancelProductionOrder(admin, {
      tenantId,
      userId: user.id,
      userEmail: user.email ?? null,
      productionOrderId: id,
      reason,
      notes,
    });
    return apiOk({ ok: true });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao cancelar OP",
      400
    );
  }
}
