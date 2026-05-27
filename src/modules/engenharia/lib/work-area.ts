import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

export async function assertWorkAreaBelongsToTenant(
  admin: SupabaseClient<Database>,
  areaId: string | null | undefined,
  tenantId: string
): Promise<boolean> {
  if (areaId == null) return true;
  const { data } = await admin
    .from("work_areas")
    .select("id")
    .eq("id", areaId)
    .eq("tenant_id", tenantId)
    .eq("is_archived", false)
    .maybeSingle();
  return !!data;
}
