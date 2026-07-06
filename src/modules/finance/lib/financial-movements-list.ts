import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";

type Admin = SupabaseClient<Database>;

export type FinancialMovementOrigin =
  | {
      kind: "purchase_order";
      label: string;
      purchase_order_id: string;
    }
  | {
      kind: "sales_order";
      label: string;
      sales_order_id: string;
    }
  | {
      kind: "manual";
      label: string;
    }
  | {
      kind: "unknown";
      label: string;
    };

export type FinancialMovementListItem = {
  id: string;
  movement_date: string;
  created_at: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  cumulative_balance: number;
  origin: FinancialMovementOrigin;
  source_kind: "payable" | "receivable" | "manual";
};

export type ListFinancialMovementsParams = {
  page: number;
  limit: number;
  direction?: "in" | "out" | "all";
  from?: string;
  to?: string;
};

export type ListFinancialMovementsResult = {
  data: FinancialMovementListItem[];
  pagination: { page: number; limit: number; total: number };
  summary: {
    opening_balance: number;
    closing_balance: number;
  };
};

type UnifiedRow = {
  uid: string;
  movement_date: string;
  created_at: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  source_kind: "payable" | "receivable" | "manual";
  source_id: string;
  reference_id: string | null;
  category: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function netAmount(direction: "in" | "out", amount: number): number {
  const amt = roundMoney(Math.abs(amount));
  return direction === "in" ? amt : -amt;
}

function compareDesc(a: UnifiedRow, b: UnifiedRow): number {
  if (a.movement_date !== b.movement_date) {
    return a.movement_date < b.movement_date ? 1 : -1;
  }
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  return a.uid < b.uid ? 1 : a.uid > b.uid ? -1 : 0;
}

function compareAsc(a: UnifiedRow, b: UnifiedRow): number {
  return -compareDesc(a, b);
}

async function buildFinancialOriginMaps(
  admin: Admin,
  tenantId: string,
  rows: UnifiedRow[]
): Promise<{
  poMap: Map<string, { po_number: string }>;
  soMap: Map<string, { order_number: string }>;
}> {
  const poMap = new Map<string, { po_number: string }>();
  const soMap = new Map<string, { order_number: string }>();

  const poIds = [
    ...new Set(
      rows
        .filter((r) => r.source_kind === "payable" && r.reference_id)
        .map((r) => r.reference_id as string)
    ),
  ];
  const soIds = [
    ...new Set(
      rows
        .filter((r) => r.source_kind === "receivable" && r.reference_id)
        .map((r) => r.reference_id as string)
    ),
  ];

  if (poIds.length) {
    const { data, error } = await admin
      .from("purchase_orders")
      .select("id, po_number")
      .eq("tenant_id", tenantId)
      .in("id", poIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.id && row.po_number) {
        poMap.set(row.id, { po_number: row.po_number });
      }
    }
  }

  if (soIds.length) {
    const { data, error } = await admin
      .from("sales_orders")
      .select("id, order_number")
      .eq("tenant_id", tenantId)
      .in("id", soIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.id && row.order_number) {
        soMap.set(row.id, { order_number: row.order_number });
      }
    }
  }

  return { poMap, soMap };
}

function resolveOrigin(
  row: UnifiedRow,
  poMap: Map<string, { po_number: string }>,
  soMap: Map<string, { order_number: string }>
): FinancialMovementOrigin {
  if (row.source_kind === "payable" && row.reference_id) {
    const po = poMap.get(row.reference_id);
    if (po) {
      return {
        kind: "purchase_order",
        label: `PC ${po.po_number}`,
        purchase_order_id: row.reference_id,
      };
    }
  }

  if (row.source_kind === "receivable" && row.reference_id) {
    const so = soMap.get(row.reference_id);
    if (so) {
      return {
        kind: "sales_order",
        label: `PV ${so.order_number}`,
        sales_order_id: row.reference_id,
      };
    }
  }

  if (row.source_kind === "manual") {
    const cat = row.category?.trim();
    const desc = row.description.trim();
    if (cat && desc) {
      return { kind: "manual", label: `${cat} — ${desc}` };
    }
    return {
      kind: "manual",
      label: desc || cat || "Lançamento manual",
    };
  }

  const fallback = row.description.trim() || "Origem não identificada";
  return { kind: "unknown", label: fallback };
}

async function loadUnifiedRows(
  admin: Admin,
  tenantId: string,
  params: {
    direction: "in" | "out" | "all";
    from?: string;
    to?: string;
  }
): Promise<UnifiedRow[]> {
  let fmQuery = admin
    .from("financial_movements")
    .select(
      "id, movement_date, created_at, direction, amount, description, source_kind, source_id, reference_id"
    )
    .eq("tenant_id", tenantId);

  if (params.direction !== "all") {
    fmQuery = fmQuery.eq("direction", params.direction);
  }
  if (params.from) {
    fmQuery = fmQuery.gte("movement_date", params.from);
  }
  if (params.to) {
    fmQuery = fmQuery.lte("movement_date", params.to);
  }

  let cfeQuery = admin
    .from("cash_flow_entries")
    .select("id, date, created_at, type, amount, description, category")
    .eq("tenant_id", tenantId);

  if (params.direction !== "all") {
    cfeQuery = cfeQuery.eq("type", params.direction);
  }
  if (params.from) {
    cfeQuery = cfeQuery.gte("date", params.from);
  }
  if (params.to) {
    cfeQuery = cfeQuery.lte("date", params.to);
  }

  const [{ data: fmRows, error: fmErr }, { data: cfeRows, error: cfeErr }] =
    await Promise.all([fmQuery, cfeQuery]);

  if (fmErr) throw new Error(fmErr.message);
  if (cfeErr) throw new Error(cfeErr.message);

  const unified: UnifiedRow[] = [];

  for (const row of fmRows ?? []) {
    const direction = row.direction === "in" ? "in" : "out";
    unified.push({
      uid: `fm:${row.id}`,
      movement_date: String(row.movement_date).slice(0, 10),
      created_at: row.created_at,
      direction,
      amount: Number(row.amount),
      description: row.description,
      source_kind:
        row.source_kind === "receivable"
          ? "receivable"
          : row.source_kind === "manual"
            ? "manual"
            : "payable",
      source_id: row.source_id,
      reference_id: row.reference_id,
      category: null,
    });
  }

  for (const row of cfeRows ?? []) {
    const direction = row.type === "in" ? "in" : "out";
    unified.push({
      uid: `cfe:${row.id}`,
      movement_date: String(row.date).slice(0, 10),
      created_at: row.created_at,
      direction,
      amount: Number(row.amount),
      description: row.description,
      source_kind: "manual",
      source_id: row.id,
      reference_id: null,
      category: row.category,
    });
  }

  return unified;
}

export async function listFinancialMovements(
  admin: Admin,
  tenantId: string,
  params: ListFinancialMovementsParams
): Promise<ListFinancialMovementsResult> {
  const page = Math.max(1, params.page);
  const limit = Math.min(100, Math.max(1, params.limit));
  const direction = params.direction ?? "all";

  const { data: companyRow, error: companyErr } = await admin
    .from("company_settings")
    .select("cash_flow_opening_balance")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (companyErr) throw new Error(companyErr.message);

  const openingBalance = roundMoney(
    Number(companyRow?.cash_flow_opening_balance ?? 0)
  );

  const unified = await loadUnifiedRows(admin, tenantId, {
    direction,
    from: params.from,
    to: params.to,
  });

  const chronological = [...unified].sort(compareAsc);
  let running = openingBalance;
  const cumulativeByUid = new Map<string, number>();

  for (const row of chronological) {
    running = roundMoney(running + netAmount(row.direction, row.amount));
    cumulativeByUid.set(row.uid, running);
  }

  const closingBalance = running;

  const sortedDesc = [...unified].sort(compareDesc);
  const total = sortedDesc.length;
  const fromIdx = (page - 1) * limit;
  const pageRows = sortedDesc.slice(fromIdx, fromIdx + limit);

  const { poMap, soMap } = await buildFinancialOriginMaps(
    admin,
    tenantId,
    pageRows
  );

  const data: FinancialMovementListItem[] = pageRows.map((row) => ({
    id: row.uid,
    movement_date: row.movement_date,
    created_at: row.created_at,
    direction: row.direction,
    amount: roundMoney(Math.abs(row.amount)),
    description: row.description,
    cumulative_balance: cumulativeByUid.get(row.uid) ?? openingBalance,
    origin: resolveOrigin(row, poMap, soMap),
    source_kind: row.source_kind,
  }));

  return {
    data,
    pagination: { page, limit, total },
    summary: {
      opening_balance: openingBalance,
      closing_balance: closingBalance,
    },
  };
}
