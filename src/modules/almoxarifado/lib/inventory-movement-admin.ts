import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { reconcileInventoryFromMovements } from "@/modules/almoxarifado/lib/inventory-balance-reconcile";

type Admin = SupabaseClient<Database>;

type MovementRow = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
};

export async function deleteInventoryMovement(
  admin: Admin,
  tenantId: string,
  movementId: string
): Promise<{ error?: string; product_id?: string }> {
  const { data: row, error: fErr } = await admin
    .from("inventory_movements")
    .select("id, product_id")
    .eq("id", movementId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fErr) return { error: fErr.message };
  if (!row) return { error: "Movimento não encontrado." };

  const { error: dErr } = await admin
    .from("inventory_movements")
    .delete()
    .eq("id", movementId)
    .eq("tenant_id", tenantId);

  if (dErr) return { error: dErr.message };

  const rec = await reconcileInventoryFromMovements(
    admin,
    tenantId,
    row.product_id
  );
  if (rec.error) return { error: rec.error, product_id: row.product_id };

  return { product_id: row.product_id };
}

export type UpdateInventoryMovementArgs = {
  quantity?: number;
  reason?: string;
};

export async function updateInventoryMovement(
  admin: Admin,
  tenantId: string,
  movementId: string,
  args: UpdateInventoryMovementArgs
): Promise<{ error?: string; data?: MovementRow }> {
  const { data: existing, error: fErr } = await admin
    .from("inventory_movements")
    .select("id, product_id, movement_type, quantity, reason")
    .eq("id", movementId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fErr) return { error: fErr.message };
  if (!existing) return { error: "Movimento não encontrado." };

  const patch: Database["public"]["Tables"]["inventory_movements"]["Update"] =
    {};

  if (args.quantity !== undefined) {
    const q = Number(args.quantity);
    if (!Number.isFinite(q) || q <= 0) {
      return { error: "Quantidade inválida." };
    }
    patch.quantity = q;
  }

  if (args.reason !== undefined) {
    patch.reason = args.reason.trim() || null;
  }

  if (!Object.keys(patch).length) {
    return { error: "Nenhum campo para actualizar." };
  }

  const { data: updated, error: uErr } = await admin
    .from("inventory_movements")
    .update(patch)
    .eq("id", movementId)
    .eq("tenant_id", tenantId)
    .select("id, product_id, movement_type, quantity")
    .maybeSingle();

  if (uErr) return { error: uErr.message };
  if (!updated) return { error: "Movimento não encontrado." };

  const rec = await reconcileInventoryFromMovements(
    admin,
    tenantId,
    updated.product_id
  );
  if (rec.error) return { error: rec.error };

  return { data: updated };
}
