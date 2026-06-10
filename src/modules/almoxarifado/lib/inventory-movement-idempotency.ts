import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

/** Evita duplicar movimento quando a mesma operação é repetida. */
export async function inventoryMovementExists(
  admin: Admin,
  tenantId: string,
  params: {
    referenceId: string;
    productId: string;
    origin: string;
    movementType: "in" | "out" | "adjustment";
  }
): Promise<boolean> {
  const { data, error } = await admin
    .from("inventory_movements")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reference_id", params.referenceId)
    .eq("product_id", params.productId)
    .eq("origin", params.origin)
    .eq("movement_type", params.movementType)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}
