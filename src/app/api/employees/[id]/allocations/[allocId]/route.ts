import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import type { Database } from "@/modules/core/types/database";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";

export const dynamic = "force-dynamic";

const allocUpdateSchema = z.object({
  work_center_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  allocation_percentage: z.number().min(0).max(100).optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type Ctx = { params: Promise<{ id: string; allocId: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const gate = await assertMenuModuleAccess("rh");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id: employeeId, allocId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = allocUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const v = parsed.data;
  type AllocUpdate =
    Database["public"]["Tables"]["employee_allocations"]["Update"];
  const update: AllocUpdate = {};
  if (v.work_center_id !== undefined) update.work_center_id = v.work_center_id;
  if (v.department_id !== undefined) update.department_id = v.department_id;
  if (v.allocation_percentage !== undefined) {
    update.allocation_percentage = v.allocation_percentage;
  }
  if (v.start_date !== undefined) update.start_date = v.start_date;
  if (v.end_date !== undefined) update.end_date = v.end_date;

  if (Object.keys(update).length === 0) {
    return apiError("Nada para atualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("employee_allocations")
    .update(update)
    .eq("id", allocId)
    .eq("employee_id", employeeId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const gate = await assertMenuModuleAccess("rh");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id: employeeId, allocId } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("employee_allocations")
    .delete()
    .eq("id", allocId)
    .eq("employee_id", employeeId)
    .eq("tenant_id", tenantId);

  if (error) {
    return apiError(error.message, supabaseErrorToHttp(error.code));
  }

  return apiOk({ ok: true });
}
