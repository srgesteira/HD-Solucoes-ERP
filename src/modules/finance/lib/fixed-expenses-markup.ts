import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

type Admin = SupabaseClient<Database>;

export type FixedCostCenterSummary = {
  competencia: string;
  cost_center_type: string;
  total_amount: number;
  items: Array<{
    id: string;
    description: string;
    amount: number;
    source: "base" | "override";
  }>;
};

/**
 * Soma mensal do centro Fixo para markup / ponto de equilíbrio.
 * Usa override da competência quando existir.
 */
type FixedExpenseMarkupRow = {
  id: string;
  description: string;
  amount: number;
  cost_center_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
};

export async function getFixedCostCenterSummary(
  admin: Admin,
  tenantId: string,
  competencia: string
): Promise<FixedCostCenterSummary> {
  const db = asUntypedAdmin(admin);

  const { data: expenses, error: eErr } = await db
    .from("fixed_expenses")
    .select("id, description, amount, cost_center_type, is_active, start_date, end_date")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("cost_center_type", "fixed");

  if (eErr) throw new Error(eErr.message);

  const monthStart = `${competencia}-01`;
  const active = ((expenses ?? []) as FixedExpenseMarkupRow[]).filter((row) => {
    const start = String(row.start_date ?? "").slice(0, 10);
    const end = row.end_date ? String(row.end_date).slice(0, 10) : null;
    if (start > monthStart) {
      const [y, m] = competencia.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${competencia}-${String(lastDay).padStart(2, "0")}`;
      if (start > monthEnd) return false;
    }
    if (end && end < monthStart) return false;
    return true;
  });

  const ids = active.map((r) => r.id as string);
  const overrideMap = new Map<string, number>();

  if (ids.length > 0) {
    const { data: overrides, error: oErr } = await db
      .from("fixed_expense_overrides")
      .select("fixed_expense_id, amount")
      .eq("tenant_id", tenantId)
      .eq("competencia", competencia)
      .in("fixed_expense_id", ids);

    if (oErr) throw new Error(oErr.message);
    for (const o of overrides ?? []) {
      overrideMap.set(String(o.fixed_expense_id), Number(o.amount));
    }
  }

  const items = active.map((row) => {
    const id = String(row.id);
    const override = overrideMap.get(id);
    const amount =
      override != null && Number.isFinite(override)
        ? override
        : Number(row.amount ?? 0);
    return {
      id,
      description: String(row.description ?? ""),
      amount,
      source: override != null ? ("override" as const) : ("base" as const),
    };
  });

  const total_amount = items.reduce((s, i) => s + i.amount, 0);

  return {
    competencia,
    cost_center_type: "fixed",
    total_amount: Math.round(total_amount * 100) / 100,
    items,
  };
}
