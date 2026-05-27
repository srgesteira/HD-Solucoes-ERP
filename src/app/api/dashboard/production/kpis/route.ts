import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertModuleAccess } from "@/modules/core/lib/module-access";
import {
  hoursBetweenTimestamps,
  parseDashboardPeriod,
  round1,
} from "@/modules/core/lib/dashboard/period";

const WORKING_DAYS_PER_MONTH = 22;
const HOURS_PER_DAY = 8;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await assertModuleAccess("production");
  if (!access.ok) return access.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { from, to } = parseDashboardPeriod(request.nextUrl.searchParams);
  const today = new Date().toISOString().slice(0, 10);
  const admin = createSupabaseAdminClient();

  const { data: orders } = await admin
    .from("production_orders")
    .select("id, status, pcp_deadline, production_deadline")
    .eq("tenant_id", tenantId);

  const list = orders ?? [];
  const delayed = list.filter((o) => {
    const deadline = o.pcp_deadline ?? o.production_deadline;
    return (
      deadline &&
      deadline < today &&
      o.status !== "finished" &&
      o.status !== "cancelled"
    );
  }).length;

  const inProduction = list.filter((o) => o.status === "in_production").length;
  const finishedAll = list.filter((o) => o.status === "finished").length;

  const periodEnd = `${to}T23:59:59.999Z`;
  const periodStart = `${from}T00:00:00.000Z`;

  const { data: finishedInPeriod } = await admin
    .from("production_orders")
    .select("created_at, finished_at")
    .eq("tenant_id", tenantId)
    .eq("status", "finished")
    .not("finished_at", "is", null)
    .gte("finished_at", periodStart)
    .lte("finished_at", periodEnd);

  let leadTimeSumDays = 0;
  let leadTimeCount = 0;
  for (const o of finishedInPeriod ?? []) {
    if (!o.finished_at || !o.created_at) continue;
    const hours = hoursBetweenTimestamps(o.created_at, o.finished_at);
    if (hours > 0) {
      leadTimeSumDays += hours / 24;
      leadTimeCount++;
    }
  }

  const avgProductionLeadTimeDays =
    leadTimeCount > 0 ? round1(leadTimeSumDays / leadTimeCount) : null;

  const { data: lineItems } = await admin
    .from("order_items")
    .select("production_start, production_end, line_id")
    .eq("tenant_id", tenantId)
    .not("production_start", "is", null)
    .not("production_end", "is", null)
    .not("line_id", "is", null)
    .gte("production_end", periodStart)
    .lte("production_start", periodEnd);

  let productionHours = 0;
  const linesUsed = new Set<string>();
  for (const item of lineItems ?? []) {
    if (!item.production_start || !item.production_end || !item.line_id)
      continue;
    productionHours += hoursBetweenTimestamps(
      item.production_start,
      item.production_end
    );
    linesUsed.add(item.line_id);
  }

  const { count: lineCount } = await admin
    .from("production_lines")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const lines = Math.max(lineCount ?? 0, linesUsed.size, 1);
  const availableHours =
    WORKING_DAYS_PER_MONTH * HOURS_PER_DAY * lines;

  const lineOccupancyPct =
    availableHours > 0
      ? round1(Math.min(100, (productionHours / availableHours) * 100))
      : null;

  return apiOk({
    data: {
      period_from: from,
      period_to: to,
      delayed_orders: delayed,
      line_occupancy_pct: lineOccupancyPct,
      orders_in_production: inProduction,
      orders_finished: finishedAll,
      orders_finished_period: finishedInPeriod?.length ?? 0,
      avg_production_lead_time_days: avgProductionLeadTimeDays,
      production_hours_period: round1(productionHours),
      productivity_note:
        "Ocupação estimada: horas apontadas / (22 dias × 8h × linhas activas).",
    },
  });
}
