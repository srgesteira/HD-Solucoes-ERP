import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { inventoryMovementExists } from "@/modules/almoxarifado/lib/inventory-movement-idempotency";

type Admin = SupabaseClient<Database>;

/** Incrementa saldo e regista movimento de entrada. */
export async function applyInventoryInbound(
  admin: Admin,
  tenantId: string,
  productId: string,
  quantity: number,
  options?: {
    reason?: string;
    referenceId?: string | null;
    origin?: string | null;
    userId?: string | null;
  }
): Promise<{ error?: string; skipped?: boolean }> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Quantidade inválida para entrada em estoque." };
  }

  const origin = options?.origin ?? null;
  const referenceId = options?.referenceId ?? null;

  if (origin && referenceId) {
    const exists = await inventoryMovementExists(admin, tenantId, {
      referenceId,
      productId,
      origin,
      movementType: "in",
    });
    if (exists) return { skipped: true };
  }

  const { data: existing, error: fetchErr } = await admin
    .from("inventory")
    .select("id, quantity_on_hand")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };

  const prev = Number(existing?.quantity_on_hand ?? 0);
  const next = prev + quantity;

  if (existing?.id) {
    const { error: upErr } = await admin
      .from("inventory")
      .update({ quantity_on_hand: next })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (upErr) return { error: upErr.message };
  } else {
    const { error: insErr } = await admin.from("inventory").insert({
      tenant_id: tenantId,
      product_id: productId,
      quantity_on_hand: next,
      reserved_quantity: 0,
      reorder_point: 0,
      reorder_quantity: 0,
    });
    if (insErr) return { error: insErr.message };
  }

  const { error: movErr } = await admin.from("inventory_movements").insert({
    tenant_id: tenantId,
    product_id: productId,
    movement_type: "in",
    quantity,
    reason: options?.reason?.trim() || "Entrada de estoque",
    reference_id: referenceId,
    origin,
    user_id: options?.userId ?? null,
  });

  if (movErr) return { error: movErr.message };
  return {};
}
