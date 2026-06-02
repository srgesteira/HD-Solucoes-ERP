import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import {
  accountsPayableCreateSchema,
} from "@/shared/contracts/pacote-a-finance.schema";
import {
  isPayablesListTab,
  type PayablesListTab,
} from "@/modules/faturamento/lib/payables-list-tabs";

export const dynamic = "force-dynamic";

const PAYABLE_STATUS = new Set(["pending", "paid", "overdue", "cancelled"]);

const UNPAID_STATUSES = ["pending", "overdue"] as const;

export async function GET(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  const supplier_id = sp.get("supplier_id");
  const overdue = sp.get("overdue");
  const tabRaw = sp.get("tab") ?? "open";
  const tab: PayablesListTab = isPayablesListTab(tabRaw) ? tabRaw : "open";
  const today = new Date().toISOString().slice(0, 10);

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let q = admin
    .from("accounts_payable")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (tab === "open") {
    q = q.in("status", [...UNPAID_STATUSES]).lte("due_date", today);
  } else if (tab === "forecast") {
    q = q.in("status", [...UNPAID_STATUSES]).gt("due_date", today);
  } else if (tab === "paid") {
    q = q.eq("status", "paid");
  }

  if (status && status !== "all") {
    if (!PAYABLE_STATUS.has(status)) return apiError("Status inválido", 400);
    q = q.eq("status", status);
  }
  if (supplier_id) {
    q = q.eq("supplier_id", supplier_id);
  }
  if (overdue === "1") {
    q = q
      .in("status", [...UNPAID_STATUSES])
      .lt("due_date", today);
  }

  const { data, error, count } = await q
    .order("due_date", { ascending: true })
    .range(from, to);

  if (error) {
    return apiError(
      "Contas a pagar: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
    tab,
  });
}

export async function POST(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = accountsPayableCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;
  const cur =
    b.current_amount !== undefined ? b.current_amount : b.original_amount;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("accounts_payable")
    .insert({
      tenant_id: tenantId,
      description: b.description,
      category: b.category,
      supplier_id: b.supplier_id ?? null,
      original_amount: b.original_amount,
      current_amount: cur,
      due_date: b.due_date,
      notes: b.notes ?? null,
      status: "pending",
      source_kind: "manual",
      amount_locked: false,
    })
    .select("*")
    .single();

  if (error) {
    return apiError(
      "Erro ao criar: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data }, 201);
}
