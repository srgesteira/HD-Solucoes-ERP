import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertModuleAccess } from "@/modules/core/lib/module-access";
import { cashFlowEntryCreateSchema } from "@/shared/contracts/pacote-a-finance.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await assertModuleAccess("finance");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("cash_flow_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(
      "Fluxo de caixa: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const list = rows ?? [];
  let balance = 0;
  for (const r of [...list].reverse()) {
    const amt = Number(r.amount ?? 0);
    if (r.type === "in") balance += amt;
    else balance -= amt;
  }
  balance = Math.round(balance * 100) / 100;

  return apiOk({ data: list, balance });
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

  const parsed = cashFlowEntryCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cash_flow_entries")
    .insert({
      tenant_id: tenantId,
      type: b.type,
      description: b.description,
      amount: b.amount,
      date: b.date,
      category: b.category ?? null,
      reference_id: b.reference_id ?? null,
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
