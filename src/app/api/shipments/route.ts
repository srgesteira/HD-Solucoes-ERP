import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  createShipment,
  listShipments,
  SHIPMENT_DIRECTIONS,
  SHIPMENT_SOURCES,
  SHIPMENT_STATUSES,
  FREIGHT_PAYERS,
  type FreightPayer,
  type ShipmentDirection,
  type ShipmentSource,
  type ShipmentStatus,
} from "@/modules/transporte/lib/shipments-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  const status = (
    statusRaw && (SHIPMENT_STATUSES as readonly string[]).includes(statusRaw)
      ? statusRaw
      : null
  ) as ShipmentStatus | null;

  try {
    const admin = createSupabaseAdminClient();
    const items = await listShipments(admin, { tenantId, status });
    return apiOk({ items });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao listar despachos",
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Body inválido", 400);
  }

  const sourceKindRaw = String(body.source_kind ?? "");
  if (!(SHIPMENT_SOURCES as readonly string[]).includes(sourceKindRaw)) {
    return apiError("source_kind inválido", 400);
  }
  const directionRaw = String(body.direction ?? "outbound");
  if (!(SHIPMENT_DIRECTIONS as readonly string[]).includes(directionRaw)) {
    return apiError("direction inválido", 400);
  }
  const freightPayerRaw =
    typeof body.freight_payer === "string" ? body.freight_payer : null;
  const freightPayer =
    freightPayerRaw &&
    (FREIGHT_PAYERS as readonly string[]).includes(freightPayerRaw)
      ? (freightPayerRaw as FreightPayer)
      : null;

  try {
    const admin = createSupabaseAdminClient();
    const created = await createShipment(admin, {
      tenantId,
      userId: user.id,
      userEmail: user.email ?? null,
      input: {
        sourceKind: sourceKindRaw as ShipmentSource,
        direction: directionRaw as ShipmentDirection,
        salesOrderId:
          typeof body.sales_order_id === "string" ? body.sales_order_id : null,
        salesReturnId:
          typeof body.sales_return_id === "string"
            ? body.sales_return_id
            : null,
        purchaseReturnId:
          typeof body.purchase_return_id === "string"
            ? body.purchase_return_id
            : null,
        destinationName:
          typeof body.destination_name === "string"
            ? body.destination_name
            : null,
        destinationDocument:
          typeof body.destination_document === "string"
            ? body.destination_document
            : null,
        destinationAddress:
          typeof body.destination_address === "string"
            ? body.destination_address
            : null,
        carrierName:
          typeof body.carrier_name === "string" ? body.carrier_name : null,
        carrierDocument:
          typeof body.carrier_document === "string"
            ? body.carrier_document
            : null,
        trackingCode:
          typeof body.tracking_code === "string" ? body.tracking_code : null,
        freightValue:
          typeof body.freight_value === "number"
            ? body.freight_value
            : Number(body.freight_value ?? 0) || 0,
        freightPayer,
        scheduledFor:
          typeof body.scheduled_for === "string" ? body.scheduled_for : null,
        notes: typeof body.notes === "string" ? body.notes : null,
      },
    });
    return apiOk({ shipment: created }, 201);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao criar despacho",
      400
    );
  }
}
