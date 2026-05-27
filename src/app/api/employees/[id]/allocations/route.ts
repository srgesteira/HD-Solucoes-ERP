import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertModuleAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

const allocSchema = z.object({
  work_center_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  allocation_percentage: z.number().min(0).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id: employeeId } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("employee_allocations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false });

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ data: data ?? [] });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const gate = await assertModuleAccess("hr");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id: employeeId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = allocSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const v = parsed.data;
  const admin = createSupabaseAdminClient();

  const { count: empOk } = await admin
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("id", employeeId)
    .eq("tenant_id", tenantId);
  if (!empOk) return apiError("Colaborador não encontrado", 404);

  const { data, error } = await admin
    .from("employee_allocations")
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      work_center_id: v.work_center_id ?? null,
      department_id: v.department_id ?? null,
      allocation_percentage: v.allocation_percentage,
      start_date: v.start_date,
      end_date: v.end_date ?? null,
    })
    .select()
    .single();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ data }, 201);
}
