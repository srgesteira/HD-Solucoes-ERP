import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { reconcileInventoryFromMovements } from "@/modules/almoxarifado/lib/inventory-balance-reconcile";

type Admin = SupabaseClient<Database>;

/**
 * Empenho MRP legado gravava saída física (incorreto).
 * A baixa real é só no abastecimento (`production_supply`).
 */
export async function removeLegacyMrpEmpenhoForProductionOrder(
  admin: Admin,
  tenantId: string,
  productionOrderId: string
): Promise<{ removed: number; error?: string }> {
  const { data: rows, error: fErr } = await admin
    .from("inventory_movements")
    .select("id, product_id")
    .eq("tenant_id", tenantId)
    .eq("movement_type", "out")
    .eq("reference_id", productionOrderId)
    .ilike("reason", "Empenho MRP%");

  if (fErr) return { removed: 0, error: fErr.message };
  if (!rows?.length) return { removed: 0 };

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const ids = rows.map((r) => r.id);

  const { error: dErr } = await admin
    .from("inventory_movements")
    .delete()
    .in("id", ids)
    .eq("tenant_id", tenantId);

  if (dErr) return { removed: 0, error: dErr.message };

  for (const productId of productIds) {
    const rec = await reconcileInventoryFromMovements(admin, tenantId, productId);
    if (rec.error) return { removed: rows.length, error: rec.error };
  }

  return { removed: rows.length };
}
