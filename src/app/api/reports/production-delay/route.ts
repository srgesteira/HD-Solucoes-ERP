import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertProductionOrReportsAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

function parseDay(iso: string | null | undefined): number | null {
  const s = iso?.slice(0, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00`).getTime();
}

function daysBetween(a: number, b: number): number {
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

type OverdueRow = {
  id: string;
  order_number: string;
  client_name: string | null;
  status: string;
  delivery_deadline: string | null;
  days_overdue: number;
};

/**
 * GET /api/reports/production-delay
 */
export async function GET() {
  const gate = await assertProductionOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: orders, error } = await admin
    .from("production_orders")
    .select(
      "id, order_number, status, delivery_deadline, finished_at, client_name, description"
    )
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError("Produção: " + error.message, 500);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  let onTime = 0;
  let late = 0;
  let totalLateDays = 0;

  const overdueById = new Map<string, OverdueRow>();

  for (const o of orders ?? []) {
    if (o.status === "cancelled") continue;

    const deadlineMs = parseDay(o.delivery_deadline);
    const finishedMs = parseDay(o.finished_at);

    if (o.status === "finished" && deadlineMs != null && finishedMs != null) {
      if (finishedMs <= deadlineMs) {
        onTime += 1;
      } else {
        late += 1;
        totalLateDays += Math.max(0, daysBetween(finishedMs, deadlineMs));
      }
      continue;
    }

    if (o.status === "finished") continue;

    const pastDeadline =
      deadlineMs != null && todayMs > deadlineMs
        ? Math.max(0, daysBetween(todayMs, deadlineMs))
        : 0;
    const delayed = o.status === "delayed";

    if (!pastDeadline && !delayed) continue;

    const daysOverdue = Math.max(pastDeadline, delayed ? pastDeadline : 0);
    const next: OverdueRow = {
      id: o.id,
      order_number: o.order_number,
      client_name: o.client_name,
      status: o.status,
      delivery_deadline: o.delivery_deadline,
      days_overdue: daysOverdue,
    };

    const prev = overdueById.get(o.id);
    if (!prev || next.days_overdue > prev.days_overdue) {
      overdueById.set(o.id, next);
    }
  }

  const overdueList = [...overdueById.values()].sort(
    (a, b) => b.days_overdue - a.days_overdue
  );

  const finishedTotal = onTime + late;
  const onTimeRatePct =
    finishedTotal > 0 ? Math.round((onTime / finishedTotal) * 1000) / 10 : null;
  const avgLateDays =
    late > 0 ? Math.round((totalLateDays / late) * 10) / 10 : null;

  return apiOk({
    summary: {
      finished_on_time: onTime,
      finished_late: late,
      on_time_rate_pct: onTimeRatePct,
      avg_late_days_when_late: avgLateDays,
      open_overdue_count: overdueList.length,
    },
    overdue_orders: overdueList,
  });
}
