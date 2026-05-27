import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import { assertModuleAccess } from "@/lib/utils/module-access";
import { employeeUpdateSchema } from "@/lib/schemas/pacote-a-finance.schema";
import type { Database } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type EmployeeUpdate = Database["public"]["Tables"]["employees"]["Update"];

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("employees")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }
  if (!data) return apiError("Colaborador não encontrado", 404);

  const { count: allocCount } = await admin
    .from("employee_allocations")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", id)
    .eq("tenant_id", tenantId);

  return apiOk({
    data: {
      ...data,
      has_period_allocations: (allocCount ?? 0) > 0,
    },
  });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = employeeUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;
  const update: EmployeeUpdate = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.document !== undefined) update.document = b.document;
  if (b.email !== undefined) {
    update.email = b.email === "" || b.email == null ? null : b.email;
  }
  if (b.phone !== undefined) update.phone = b.phone;
  if (b.position !== undefined) update.position = b.position;
  if (b.monthly_salary !== undefined) update.monthly_salary = b.monthly_salary;
  if (b.work_center_id !== undefined) update.work_center_id = b.work_center_id;
  if (b.department_id !== undefined) update.department_id = b.department_id;
  if (b.allocation_percentage !== undefined) {
    update.allocation_percentage = b.allocation_percentage;
  }
  if (b.admission_date !== undefined) update.admission_date = b.admission_date;
  if (b.status !== undefined) update.status = b.status;
  if (b.notes !== undefined) update.notes = b.notes;

  if (Object.keys(update).length === 0) {
    return apiError("Nada para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("employees")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) {
    return apiError(
      "Erro ao atualizar: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem excluir.", 403);
  }

  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("employees")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError(
      "Erro ao excluir: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  return apiOk({ ok: true });
}
