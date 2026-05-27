import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertFinanceOrReportsAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

function dayStart(iso: string): number {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function daysLate(todayMs: number, dueIso: string): number {
  const due = dayStart(dueIso);
  return Math.floor((todayMs - due) / (24 * 60 * 60 * 1000));
}

/**
 * GET /api/reports/overdue-receivables
 * Títulos pendentes/parciais com vencimento anterior a hoje, agrupados por cliente e faixas de atraso.
 */
export async function GET() {
  const gate = await assertFinanceOrReportsAccess();
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const todayStr = today.toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from("receivables")
    .select(
      "id, client_name, client_document, due_date, current_amount, status, document_number, description"
    )
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "partial"])
    .lt("due_date", todayStr);

  if (error) {
    return apiError("Recebíveis: " + error.message, 500);
  }

  type ClientAgg = {
    client_name: string;
    client_document: string | null;
    total: number;
    bucket_1_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_91_plus: number;
    items: Array<{
      id: string;
      document_number: string | null;
      due_date: string;
      current_amount: number;
      days_late: number;
    }>;
  };

  const byClient = new Map<string, ClientAgg>();

  for (const r of rows ?? []) {
    const late = daysLate(todayMs, r.due_date);
    if (late < 1) continue;

    const name = (r.client_name ?? "Sem cliente").trim() || "Sem cliente";
    const key = `${name}|${r.client_document ?? ""}`;
    const amt = Number(r.current_amount ?? 0);
    if (!Number.isFinite(amt)) continue;

    const g =
      byClient.get(key) ??
      ({
        client_name: name,
        client_document: r.client_document,
        total: 0,
        bucket_1_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_91_plus: 0,
        items: [],
      } as ClientAgg);

    g.total += amt;
    if (late >= 1 && late <= 30) g.bucket_1_30 += amt;
    else if (late >= 31 && late <= 60) g.bucket_31_60 += amt;
    else if (late >= 61 && late <= 90) g.bucket_61_90 += amt;
    else if (late >= 91) g.bucket_91_plus += amt;

    g.items.push({
      id: r.id,
      document_number: r.document_number,
      due_date: r.due_date,
      current_amount: Math.round(amt * 100) / 100,
      days_late: late,
    });

    byClient.set(key, g);
  }

  const groups = [...byClient.values()].sort((a, b) => b.total - a.total);

  const totals = groups.reduce(
    (acc, g) => ({
      total: acc.total + g.total,
      bucket_1_30: acc.bucket_1_30 + g.bucket_1_30,
      bucket_31_60: acc.bucket_31_60 + g.bucket_31_60,
      bucket_61_90: acc.bucket_61_90 + g.bucket_61_90,
      bucket_91_plus: acc.bucket_91_plus + g.bucket_91_plus,
    }),
    {
      total: 0,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_91_plus: 0,
    }
  );

  return apiOk({
    groups: groups.map((g) => ({
      ...g,
      total: Math.round(g.total * 100) / 100,
      bucket_1_30: Math.round(g.bucket_1_30 * 100) / 100,
      bucket_31_60: Math.round(g.bucket_31_60 * 100) / 100,
      bucket_61_90: Math.round(g.bucket_61_90 * 100) / 100,
      bucket_91_plus: Math.round(g.bucket_91_plus * 100) / 100,
    })),
    totals: {
      total: Math.round(totals.total * 100) / 100,
      bucket_1_30: Math.round(totals.bucket_1_30 * 100) / 100,
      bucket_31_60: Math.round(totals.bucket_31_60 * 100) / 100,
      bucket_61_90: Math.round(totals.bucket_61_90 * 100) / 100,
      bucket_91_plus: Math.round(totals.bucket_91_plus * 100) / 100,
    },
  });
}
