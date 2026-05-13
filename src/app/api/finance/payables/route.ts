import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";
import {
  accountsPayableCreateSchema,
  accountsPayableUpdateSchema,
} from "@/lib/schemas/pacote-a-finance.schema";

export const dynamic = "force-dynamic";

const PAYABLE_STATUS = new Set(["pending", "paid", "overdue", "cancelled"]);

export async function GET(request: NextRequest) {
  const gate = await assertModuleAccess("finance");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  const supplier_id = sp.get("supplier_id");
  const overdue = sp.get("overdue");

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createSupabaseAdminClient();
  let q = admin
    .from("accounts_payable")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (status && status !== "all") {
    if (!PAYABLE_STATUS.has(status)) return apiError("Status inválido", 400);
    q = q.eq("status", status);
  }
  if (supplier_id) {
    q = q.eq("supplier_id", supplier_id);
  }
  if (overdue === "1") {
    const today = new Date().toISOString().slice(0, 10);
    q = q
      .in("status", ["pending", "overdue"])
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
  });
}

export async function POST(request: NextRequest) {
  const gate = await assertModuleAccess("finance");
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
