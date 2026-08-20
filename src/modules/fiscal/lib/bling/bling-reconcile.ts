import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { blingGet } from "@/modules/fiscal/lib/bling/bling-client";
import {
  parseBlingNfeSnapshot,
  type BlingNfeSnapshot,
} from "@/modules/fiscal/lib/bling/bling-nfe-status";
import { applyBlingNfeSnapshot } from "@/modules/fiscal/lib/bling/bling-apply-status";
import { digitsOnly } from "@/modules/fiscal/lib/bling/bling-catalog";

type Admin = SupabaseClient<Database>;

function containsErpMarker(value: unknown, salesOrderId: string): boolean {
  const marker = `HD-ERP:${salesOrderId}`;
  if (typeof value === "string") return value.includes(marker);
  if (!value || typeof value !== "object") return false;
  return JSON.stringify(value).includes(marker);
}

export async function searchBlingNfeForErpOrder(
  admin: Admin,
  tenantId: string,
  salesOrderId: string,
  contactId: number
): Promise<BlingNfeSnapshot | null> {
  const from = new Date();
  from.setDate(from.getDate() - 14);
  const qs = new URLSearchParams({
    pagina: "1",
    limite: "100",
    idContato: String(contactId),
    dataEmissaoInicial: from.toISOString().slice(0, 10),
    dataEmissaoFinal: new Date().toISOString().slice(0, 10),
  });
  const listed = await blingGet(admin, tenantId, `/nfe?${qs.toString()}`);
  const rows = Array.isArray((listed as { data?: unknown }).data)
    ? ((listed as { data: Array<Record<string, unknown>> }).data)
    : [];

  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    if (containsErpMarker(row.observacoes, salesOrderId)) {
      const detail = await blingGet(admin, tenantId, `/nfe/${id}`);
      return parseBlingNfeSnapshot(detail, id);
    }
    const detail = await blingGet(admin, tenantId, `/nfe/${id}`);
    const data = (detail as { data?: Record<string, unknown> }).data ?? {};
    if (containsErpMarker(data.observacoes, salesOrderId)) {
      return parseBlingNfeSnapshot(detail, id);
    }
  }
  return null;
}

export type BlingReconcileResult = {
  tenant_id: string;
  checked: number;
  updated: number;
  errors: string[];
};

export async function reconcilePendingBlingNfes(
  admin: Admin,
  tenantId: string
): Promise<BlingReconcileResult> {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("nfes")
    .select("id, bling_nfe_id, sales_order_id, status, reconcile_needed")
    .eq("tenant_id", tenantId)
    .eq("provider", "bling")
    .or("status.in.(pending,processing),reconcile_needed.eq.true")
    .limit(50);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    bling_nfe_id: number | null;
    sales_order_id: string | null;
    status: string;
    reconcile_needed: boolean;
  }>;

  const errors: string[] = [];
  let updated = 0;

  for (const row of rows) {
    try {
      if (row.bling_nfe_id) {
        const payload = await blingGet(admin, tenantId, `/nfe/${row.bling_nfe_id}`);
        const snapshot = parseBlingNfeSnapshot(payload, Number(row.bling_nfe_id));
        await applyBlingNfeSnapshot(admin, tenantId, row.id, snapshot);
        updated += 1;
        continue;
      }
      if (!row.sales_order_id) continue;
      const { data: so } = await db
        .from("sales_orders")
        .select("client_document")
        .eq("id", row.sales_order_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const doc = digitsOnly(
        (so as { client_document?: string | null } | null)?.client_document
      );
      const { data: cust } = await db
        .from("customers")
        .select("bling_contact_id, document")
        .eq("tenant_id", tenantId)
        .not("bling_contact_id", "is", null);
      const contactId = (
        (cust ?? []) as Array<{
          bling_contact_id: number;
          document: string | null;
        }>
      ).find((c) => digitsOnly(c.document) === doc && doc.length >= 11)
        ?.bling_contact_id;
      const found = contactId
        ? await searchBlingNfeForErpOrder(
            admin,
            tenantId,
            row.sales_order_id,
            Number(contactId)
          )
        : null;
      if (found) {
        await applyBlingNfeSnapshot(admin, tenantId, row.id, found);
        updated += 1;
      }
    } catch (e) {
      errors.push(
        `${row.id}: ${e instanceof Error ? e.message : "erro desconhecido"}`
      );
    }
  }

  return {
    tenant_id: tenantId,
    checked: rows.length,
    updated,
    errors,
  };
}
