import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

/** Garante `production_lines` espelhada para PCP quando existe `work_centers`. */
export async function ensureProductionLineForWorkCenter(
  admin: Admin,
  tenantId: string,
  wc: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    is_active?: boolean;
  }
): Promise<string> {
  const { data: byWc } = await admin
    .from("production_lines")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("work_center_id", wc.id)
    .maybeSingle();

  if (byWc?.id) {
    await admin
      .from("production_lines")
      .update({
        code: wc.code,
        name: wc.name,
        description: wc.description ?? null,
        is_active: wc.is_active ?? true,
      })
      .eq("id", byWc.id)
      .eq("tenant_id", tenantId);
    return byWc.id;
  }

  const { data: byCode } = await admin
    .from("production_lines")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", wc.code)
    .maybeSingle();

  if (byCode?.id) {
    await admin
      .from("production_lines")
      .update({
        work_center_id: wc.id,
        name: wc.name,
        description: wc.description ?? null,
        is_active: wc.is_active ?? true,
      })
      .eq("id", byCode.id)
      .eq("tenant_id", tenantId);
    return byCode.id;
  }

  const { data: created, error } = await admin
    .from("production_lines")
    .insert({
      tenant_id: tenantId,
      code: wc.code,
      name: wc.name,
      description: wc.description ?? null,
      is_active: wc.is_active ?? true,
      sort_order: 0,
      work_center_id: wc.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return created.id;
}
