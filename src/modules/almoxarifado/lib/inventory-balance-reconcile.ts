import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export function signedMovementQuantity(
  movementType: string,
  quantity: number
): number {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return 0;
  if (movementType === "in") return Math.abs(q);
  if (movementType === "out") return -Math.abs(q);
  return q;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Alinha `inventory.quantity_on_hand` à soma dos movimentos de um produto. */
export async function reconcileInventoryFromMovements(
  admin: Admin,
  tenantId: string,
  productId: string
): Promise<{ quantity_on_hand: number; error?: string }> {
  const { data: movs, error: mErr } = await admin
    .from("inventory_movements")
    .select("movement_type, quantity")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);

  if (mErr) return { quantity_on_hand: 0, error: mErr.message };

  let sum = 0;
  for (const m of movs ?? []) {
    sum = round4(
      sum + signedMovementQuantity(m.movement_type, Number(m.quantity))
    );
  }

  const { data: existing, error: fErr } = await admin
    .from("inventory")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (fErr) return { quantity_on_hand: sum, error: fErr.message };

  if (existing?.id) {
    const { error: upErr } = await admin
      .from("inventory")
      .update({ quantity_on_hand: sum })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (upErr) return { quantity_on_hand: sum, error: upErr.message };
  } else if (Math.abs(sum) > 0.0001) {
    const { error: insErr } = await admin.from("inventory").insert({
      tenant_id: tenantId,
      product_id: productId,
      quantity_on_hand: sum,
      reserved_quantity: 0,
      reorder_point: 0,
      reorder_quantity: 0,
    });
    if (insErr) return { quantity_on_hand: sum, error: insErr.message };
  }

  return { quantity_on_hand: sum };
}
