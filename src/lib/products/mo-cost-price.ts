import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  getLatestLaborHourlyRateForWorkCenter,
  getLaborHourlyRateForProductionLine,
} from "@/lib/labor-cost-utils";

type Admin = SupabaseClient<Database>;

export type ResolveMoCostInput = {
  cost_price?: number | null;
  default_is_external_labor?: boolean | null;
  default_work_center_id?: string | null;
  default_production_line_id?: string | null;
};

/** Resolve custo unitário de produto MO (manual ou hourly_cost do centro interno). */
export async function resolveMoProductCostPrice(
  admin: Admin,
  tenantId: string,
  input: ResolveMoCostInput
): Promise<number> {
  const manual = Number(input.cost_price ?? 0);
  if (Number.isFinite(manual) && manual > 0) {
    return manual;
  }

  if (input.default_is_external_labor) {
    return 0;
  }

  const plId = input.default_production_line_id?.trim();
  if (plId) {
    const fromLine = await getLaborHourlyRateForProductionLine(
      admin,
      tenantId,
      plId
    );
    if (fromLine != null && fromLine > 0) return fromLine;
  }

  const wcId = input.default_work_center_id?.trim();
  if (!wcId) return 0;

  const fromLabor = await getLatestLaborHourlyRateForWorkCenter(
    admin,
    tenantId,
    wcId
  );
  if (fromLabor != null && Number.isFinite(fromLabor) && fromLabor > 0) {
    return fromLabor;
  }

  const { data: wc } = await admin
    .from("work_centers")
    .select("hourly_cost")
    .eq("id", wcId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return Number(wc?.hourly_cost ?? 0);
}
