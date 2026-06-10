import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { INVENTORY_ORIGIN } from "@/modules/almoxarifado/lib/inventory-origins";

type Admin = SupabaseClient<Database>;

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export type ApplyInventoryBalanceArgs = {
  quantity_on_hand: number;
  reserved_quantity?: number;
  reorder_point?: number;
  reorder_quantity?: number;
  reason?: string;
  userId?: string | null;
};

/**
 * Define saldo alvo e regista movimento `adjustment` com o delta.
 * Parâmetros de reposição (reservado, ponto de encomenda) actualizam só inventory.
 */
export async function applyInventoryBalanceUpdate(
  admin: Admin,
  tenantId: string,
  productId: string,
  args: ApplyInventoryBalanceArgs
): Promise<{ error?: string; delta?: number }> {
  const targetQty = round4(args.quantity_on_hand);
  if (!Number.isFinite(targetQty) || targetQty < 0) {
    return { error: "Quantidade em mão inválida." };
  }

  const { data: existing, error: fetchErr } = await admin
    .from("inventory")
    .select("id, quantity_on_hand")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };

  const prev = round4(Number(existing?.quantity_on_hand ?? 0));
  const delta = round4(targetQty - prev);

  const invPayload: Database["public"]["Tables"]["inventory"]["Insert"] = {
    tenant_id: tenantId,
    product_id: productId,
    quantity_on_hand: targetQty,
    reserved_quantity: args.reserved_quantity ?? 0,
    reorder_point: args.reorder_point ?? 0,
    reorder_quantity: args.reorder_quantity ?? 0,
    last_counted_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: upErr } = await admin
      .from("inventory")
      .update({
        quantity_on_hand: targetQty,
        reserved_quantity: args.reserved_quantity ?? 0,
        reorder_point: args.reorder_point ?? 0,
        reorder_quantity: args.reorder_quantity ?? 0,
        last_counted_at: invPayload.last_counted_at,
      })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (upErr) return { error: upErr.message };
  } else {
    const { error: insErr } = await admin.from("inventory").insert(invPayload);
    if (insErr) return { error: insErr.message };
  }

  if (Math.abs(delta) < 0.0001) {
    return { delta: 0 };
  }

  const { error: movErr } = await admin.from("inventory_movements").insert({
    tenant_id: tenantId,
    product_id: productId,
    movement_type: "adjustment",
    quantity: delta,
    reason: args.reason?.trim() || "Ajuste manual de inventário",
    reference_id: null,
    origin: INVENTORY_ORIGIN.MANUAL_ADJUST,
    user_id: args.userId ?? null,
  });

  if (movErr) return { error: movErr.message };
  return { delta };
}
