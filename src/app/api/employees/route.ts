import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
} from "@/lib/schemas/pacote-a-finance.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("employees")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    return apiError(
      "Colaboradores: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const { data: allocRows } = await admin
    .from("employee_allocations")
    .select("employee_id")
    .eq("tenant_id", tenantId);

  const withPeriod = new Set(
    (allocRows ?? []).map((r) => r.employee_id)
  );

  const enriched = (data ?? []).map((e) => ({
    ...e,
    has_period_allocations: withPeriod.has(e.id),
  }));

  return apiOk({ data: enriched });
}

export async function POST(request: NextRequest) {
  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = employeeCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("employees")
    .insert({
      tenant_id: tenantId,
      name: b.name,
      document: b.document ?? null,
      email: b.email === "" || b.email == null ? null : b.email,
      phone: b.phone ?? null,
      position: b.position ?? null,
      monthly_salary: b.monthly_salary ?? null,
      work_center_id: b.work_center_id ?? null,
      department_id: b.department_id ?? null,
      allocation_percentage: b.allocation_percentage ?? 100,
      admission_date: b.admission_date ?? null,
      status: b.status ?? "active",
      notes: b.notes ?? null,
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
