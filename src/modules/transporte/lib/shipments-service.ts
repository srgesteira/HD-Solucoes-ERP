import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { recordAuditEvent } from "@/modules/core/lib/audit/audit-log";
import { releaseSalesOrderFinishedGoodsReservations } from "@/modules/almoxarifado/lib/inventory-reservations";
import { assertSalesOrderReadyForHvacDispatch } from "@/modules/hvac/lib/hvac-integrity-test-service";

/**
 * §9 do documento funcional: módulo Transporte / Expedição.
 *
 * - Shipment é centralizador da carga: vincula a documento origem
 *   (pedido de venda, devolução de venda, devolução de compra ou
 *   manual) e guarda transportadora, tracking, prazo e custo.
 * - Status: prepared → in_transit → delivered (ou cancelled).
 * - Não duplica estoque: o ledger de inventory é mexido pelo documento
 *   origem (ex.: devolução de compra ao despachar). Aqui só rastrea
 *   quem leva, quando, quanto, e em que veículo.
 */

export const SHIPMENT_STATUSES = [
  "prepared",
  "in_transit",
  "delivered",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_SOURCES = [
  "sales_order",
  "sales_return",
  "purchase_return",
  "manual",
] as const;
export type ShipmentSource = (typeof SHIPMENT_SOURCES)[number];

export const SHIPMENT_DIRECTIONS = ["outbound", "inbound"] as const;
export type ShipmentDirection = (typeof SHIPMENT_DIRECTIONS)[number];

export const FREIGHT_PAYERS = [
  "shipper",
  "consignee",
  "third_party",
] as const;
export type FreightPayer = (typeof FREIGHT_PAYERS)[number];

export type CreateShipmentInput = {
  sourceKind: ShipmentSource;
  direction: ShipmentDirection;
  salesOrderId?: string | null;
  salesReturnId?: string | null;
  purchaseReturnId?: string | null;
  destinationName?: string | null;
  destinationDocument?: string | null;
  destinationAddress?: string | null;
  carrierName?: string | null;
  carrierDocument?: string | null;
  trackingCode?: string | null;
  freightValue?: number;
  freightPayer?: FreightPayer | null;
  scheduledFor?: string | null;
  notes?: string | null;
};

type Admin = SupabaseClient<Database>;

async function nextShipmentNumber(
  admin: Admin,
  tenantId: string
): Promise<string> {
  const db = asUntypedAdmin(admin);
  const year = new Date().getFullYear();
  const prefix = `EXP-${year}-`;
  const { data } = await db
    .from("shipments")
    .select("shipment_number")
    .eq("tenant_id", tenantId)
    .ilike("shipment_number", `${prefix}%`)
    .order("shipment_number", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const last = (data[0] as { shipment_number: string }).shipment_number;
    const seq = parseInt(last.replace(prefix, ""), 10);
    if (Number.isFinite(seq)) next = seq + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createShipment(
  admin: Admin,
  args: { tenantId: string; userId: string; userEmail: string | null } & {
    input: CreateShipmentInput;
  }
): Promise<{ id: string; shipment_number: string }> {
  const { tenantId, userId, userEmail, input } = args;
  const db = asUntypedAdmin(admin);
  const shipmentNumber = await nextShipmentNumber(admin, tenantId);

  const { data, error } = await db
    .from("shipments")
    .insert({
      tenant_id: tenantId,
      shipment_number: shipmentNumber,
      source_kind: input.sourceKind,
      direction: input.direction,
      sales_order_id: input.salesOrderId ?? null,
      sales_return_id: input.salesReturnId ?? null,
      purchase_return_id: input.purchaseReturnId ?? null,
      destination_name: input.destinationName ?? null,
      destination_document: input.destinationDocument ?? null,
      destination_address: input.destinationAddress ?? null,
      carrier_name: input.carrierName ?? null,
      carrier_document: input.carrierDocument ?? null,
      tracking_code: input.trackingCode ?? null,
      freight_value: input.freightValue ?? 0,
      freight_payer: input.freightPayer ?? null,
      scheduled_for: input.scheduledFor ?? null,
      notes: input.notes ?? null,
      status: "prepared",
      created_by: userId,
    })
    .select("id, shipment_number")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Erro ao criar despacho");

  await recordAuditEvent(admin, {
    tenantId,
    actorId: userId,
    actorEmail: userEmail,
    table: "shipments",
    recordId: (data as { id: string }).id,
    eventKind: "shipment_created",
    payload: {
      source_kind: input.sourceKind,
      direction: input.direction,
      carrier: input.carrierName,
      scheduled_for: input.scheduledFor,
    },
  });
  return data as { id: string; shipment_number: string };
}

export async function dispatchShipment(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    userEmail: string | null;
    shipmentId: string;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);

  const { data: shipment, error: loadErr } = await db
    .from("shipments")
    .select("source_kind, sales_order_id")
    .eq("id", args.shipmentId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!shipment) throw new Error("Despacho não encontrado.");

  if (
    shipment.source_kind === "sales_order" &&
    shipment.sales_order_id
  ) {
    await assertSalesOrderReadyForHvacDispatch(
      admin,
      args.tenantId,
      shipment.sales_order_id
    );
  }

  const { error } = await db
    .from("shipments")
    .update({
      status: "in_transit",
      shipped_at: new Date().toISOString(),
      shipped_by: args.userId,
    })
    .eq("id", args.shipmentId)
    .eq("tenant_id", args.tenantId)
    .eq("status", "prepared");
  if (error) throw new Error(error.message);

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "shipments",
    recordId: args.shipmentId,
    eventKind: "shipment_dispatched",
  });
}

export async function deliverShipment(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    userEmail: string | null;
    shipmentId: string;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("shipments")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      delivered_by: args.userId,
    })
    .eq("id", args.shipmentId)
    .eq("tenant_id", args.tenantId)
    .in("status", ["in_transit", "prepared"]);
  if (error) throw new Error(error.message);

  const { data: shipment } = await db
    .from("shipments")
    .select("sales_order_id, source_kind")
    .eq("id", args.shipmentId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();

  if (
    shipment?.sales_order_id &&
    shipment.source_kind === "sales_order"
  ) {
    try {
      await releaseSalesOrderFinishedGoodsReservations(admin, {
        tenantId: args.tenantId,
        salesOrderId: shipment.sales_order_id as string,
        releaseReason: "shipment_delivered",
        userId: args.userId,
        userEmail: args.userEmail,
      });
    } catch (relErr) {
      console.warn(
        "[shipment] Falha ao liberar empenho do PV:",
        relErr instanceof Error ? relErr.message : relErr
      );
    }
  }

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "shipments",
    recordId: args.shipmentId,
    eventKind: "shipment_delivered",
  });
}

export async function cancelShipment(
  admin: Admin,
  args: {
    tenantId: string;
    userId: string;
    userEmail: string | null;
    shipmentId: string;
    reason: string | null;
  }
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const { error } = await db
    .from("shipments")
    .update({ status: "cancelled" })
    .eq("id", args.shipmentId)
    .eq("tenant_id", args.tenantId)
    .neq("status", "delivered");
  if (error) throw new Error(error.message);

  await recordAuditEvent(admin, {
    tenantId: args.tenantId,
    actorId: args.userId,
    actorEmail: args.userEmail,
    table: "shipments",
    recordId: args.shipmentId,
    eventKind: "shipment_cancelled",
    payload: { reason: args.reason },
  });
}

export async function listShipments(
  admin: Admin,
  args: { tenantId: string; status?: ShipmentStatus | null }
) {
  const db = asUntypedAdmin(admin);
  let q = db
    .from("shipments")
    .select(
      "id, shipment_number, source_kind, direction, status, scheduled_for, shipped_at, delivered_at, destination_name, carrier_name, tracking_code, freight_value, sales_order_id, sales_return_id, purchase_return_id"
    )
    .eq("tenant_id", args.tenantId)
    .order("created_at", { ascending: false });
  if (args.status) {
    q = q.eq("status", args.status);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getShipment(
  admin: Admin,
  args: { tenantId: string; shipmentId: string }
) {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("shipments")
    .select("*")
    .eq("id", args.shipmentId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
