import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  currentUserCanModule,
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { filterAllowedPatch } from "@/shared/auth/field-permissions";
import {
  getShipment,
  updateShipmentLogistics,
  type UpdateShipmentLogisticsPatch,
} from "@/modules/transporte/lib/shipments-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const admin = createSupabaseAdminClient();
    const shipment = await getShipment(admin, { tenantId, shipmentId: id });
    if (!shipment) return apiError("Despacho não encontrado", 404);
    return apiOk({ shipment });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao buscar despacho",
      500
    );
  }
}

/**
 * PATCH — só campos da allowlist Expedição (field-permissions).
 * Qualquer outro campo no payload → 403.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const isAdmin = await isCurrentUserTenantAdmin();
  const canLogistics = await currentUserCanModule("logistics");
  if (!isAdmin && !canLogistics) {
    return apiError("Sem permissão para editar expedição", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const raw =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const check = filterAllowedPatch("shipments", "expedicao", raw);
  if (!check.ok) {
    return apiError(
      `Campos fora da alçada da Expedição: ${check.forbidden.join(", ")}`,
      403
    );
  }
  if (Object.keys(check.patch).length === 0) {
    return apiError("Nenhum campo para actualizar", 400);
  }

  const patch: UpdateShipmentLogisticsPatch = {};
  if ("carrier_name" in check.patch) {
    const v = check.patch.carrier_name;
    patch.carrier_name =
      v === null || v === undefined || v === "" ? null : String(v);
  }
  if ("carrier_document" in check.patch) {
    const v = check.patch.carrier_document;
    patch.carrier_document =
      v === null || v === undefined || v === "" ? null : String(v);
  }
  if ("volumes_count" in check.patch) {
    const v = check.patch.volumes_count;
    if (v === null || v === undefined || v === "") {
      patch.volumes_count = null;
    } else {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return apiError("volumes_count deve ser inteiro ≥ 0", 400);
      }
      patch.volumes_count = n;
    }
  }
  if ("packaging_description" in check.patch) {
    const v = check.patch.packaging_description;
    patch.packaging_description =
      v === null || v === undefined || v === "" ? null : String(v);
  }

  try {
    const admin = createSupabaseAdminClient();
    const shipment = await updateShipmentLogistics(admin, {
      tenantId,
      userId: user.id,
      userEmail: user.email ?? null,
      shipmentId: id,
      patch,
    });
    return apiOk({ shipment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao actualizar despacho";
    if (msg.includes("não encontrado")) return apiError(msg, 404);
    return apiError(msg, 500);
  }
}
