import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

type Admin = SupabaseClient<Database>;

type RoutingStep = {
  sequence: number;
  name: string;
  production_line_id: string | null;
  work_center_id: string | null;
  default_duration_minutes: number | null;
  notes: string | null;
};

/** Copia roteiro do produto para a OP ou cria operação única (UX legado). */
export async function ensureOrderItemOperations(
  admin: Admin,
  tenantId: string,
  orderItemId: string,
  productId: string | null,
  defaultLineId?: string | null
): Promise<void> {
  const db = asUntypedAdmin(admin);

  const { data: existing, error: existErr } = await db
    .from("order_item_operations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("order_item_id", orderItemId)
    .limit(1);

  if (existErr) throw new Error(existErr.message);
  if (existing?.length) return;

  let steps: RoutingStep[] = [];

  if (productId) {
    const { data: templateSteps, error: tplErr } = await db
      .from("product_routing_steps")
      .select(
        "sequence, name, production_line_id, work_center_id, default_duration_minutes, notes"
      )
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .order("sequence", { ascending: true });

    if (tplErr) throw new Error(tplErr.message);
    steps = (templateSteps ?? []) as RoutingStep[];
  }

  if (steps.length === 0) {
    let lineId = defaultLineId ?? null;
    let opName = "Produção";

    if (productId) {
      const { data: prod, error: prodErr } = await admin
        .from("products")
        .select("name, default_production_line_id")
        .eq("id", productId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (prodErr) throw new Error(prodErr.message);
      if (prod?.default_production_line_id) {
        lineId = prod.default_production_line_id;
      }
      if (prod?.name?.trim()) opName = prod.name.trim();
    }

    steps = [
      {
        sequence: 1,
        name: opName,
        production_line_id: lineId,
        work_center_id: null,
        default_duration_minutes: null,
        notes: null,
      },
    ];
  }

  const rows = steps.map((s) => ({
    tenant_id: tenantId,
    order_item_id: orderItemId,
    sequence: s.sequence,
    name: s.name,
    production_line_id: s.production_line_id,
    work_center_id: s.work_center_id,
    planned_duration_minutes: s.default_duration_minutes,
    status: "pending",
    notes: s.notes,
  }));

  const { error: insErr } = await db.from("order_item_operations").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

export async function listOrderItemOperations(
  admin: Admin,
  tenantId: string,
  orderItemId: string
) {
  const db = asUntypedAdmin(admin);
  const { data, error } = await db
    .from("order_item_operations")
    .select(
      "id, sequence, name, status, planned_duration_minutes, started_at, completed_at, production_line_id, work_center_id, notes"
    )
    .eq("tenant_id", tenantId)
    .eq("order_item_id", orderItemId)
    .order("sequence", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateOrderItemOperationStatus(
  admin: Admin,
  tenantId: string,
  operationId: string,
  status: "pending" | "in_progress" | "completed" | "skipped"
): Promise<void> {
  const db = asUntypedAdmin(admin);
  const patch: Database["public"]["Tables"]["order_item_operations"]["Update"] = {
    status,
  };

  if (status === "in_progress") {
    patch.started_at = new Date().toISOString();
  } else if (status === "completed") {
    patch.completed_at = new Date().toISOString();
    if (!patch.started_at) {
      patch.started_at = new Date().toISOString();
    }
  } else if (status === "pending") {
    patch.started_at = null;
    patch.completed_at = null;
  }

  const { error } = await db
    .from("order_item_operations")
    .update(patch)
    .eq("id", operationId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
}
