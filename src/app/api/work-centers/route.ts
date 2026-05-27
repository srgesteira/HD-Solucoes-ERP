import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId, isCurrentUserTenantAdmin } from "@/modules/core/lib/tenant";
import { workCenterSchema } from "@/shared/contracts/product.schema";
import { ensureProductionLineForWorkCenter } from "@/modules/producao/lib/production-line-sync";
import type { Database } from "@/modules/core/types/database";

export const dynamic = "force-dynamic";

type WorkCenterRow = Database["public"]["Tables"]["work_centers"]["Row"];

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("work_centers")
    .select(
      "id, tenant_id, code, name, hourly_cost, efficiency, description, is_active, default_monthly_hours, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("code", { ascending: true });

  if (error) {
    return apiError(
      "Erro ao listar centros de trabalho: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  const rows = (data ?? []) as WorkCenterRow[];
  const ids = rows.map((r) => r.id);
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;

  const thisMonth = new Map<string, number>();
  const latest = new Map<string, number>();
  let lcRows: {
    work_center_id: string;
    hourly_rate: number;
    direct_hourly_rate: number | null;
    allocated_hourly_rate: number | null;
    year: number;
    month: number;
  }[] = [];

  if (ids.length) {
    const { data: lcData, error: lcErr } = await admin
      .from("labor_costs")
      .select(
        "work_center_id, hourly_rate, direct_hourly_rate, allocated_hourly_rate, year, month"
      )
      .eq("tenant_id", tenantId)
      .in("work_center_id", ids);

    if (lcErr) {
      return apiError(
        "Erro ao carregar custos de mão de obra: " + lcErr.message,
        supabaseErrorToHttp(lcErr.code)
      );
    }

    lcRows = lcData ?? [];

    const byCenter = new Map<string, { y: number; m: number; rate: number }>();
    for (const row of lcRows) {
      const wid = row.work_center_id;
      const s = row.year * 100 + row.month;
      const cur = byCenter.get(wid);
      if (!cur || s > cur.y * 100 + cur.m) {
        byCenter.set(wid, {
          y: row.year,
          m: row.month,
          rate: Number(row.hourly_rate),
        });
      }
      if (row.year === cy && row.month === cm) {
        thisMonth.set(wid, Number(row.hourly_rate));
      }
    }
    for (const [wid, v] of byCenter) {
      latest.set(wid, v.rate);
    }
  }

  const thisMonthDetail = new Map<
    string,
    { rate: number; direct: number | null; allocated: number | null }
  >();
  for (const row of lcRows ?? []) {
    if (row.year === cy && row.month === cm) {
      thisMonthDetail.set(row.work_center_id, {
        rate: Number(row.hourly_rate),
        direct:
          row.direct_hourly_rate != null
            ? Number(row.direct_hourly_rate)
            : null,
        allocated:
          row.allocated_hourly_rate != null
            ? Number(row.allocated_hourly_rate)
            : null,
      });
    }
  }

  type RowExt = WorkCenterRow & {
    labor_hourly_rate_this_month: number | null;
    labor_hourly_rate_latest: number | null;
    labor_direct_hourly_this_month: number | null;
    labor_allocated_hourly_this_month: number | null;
  };

  const enriched: RowExt[] = rows.map((r) => {
    const cur = thisMonthDetail.get(r.id);
    return {
      ...r,
      labor_hourly_rate_this_month: thisMonth.get(r.id) ?? null,
      labor_hourly_rate_latest: latest.get(r.id) ?? null,
      labor_direct_hourly_this_month: cur?.direct ?? null,
      labor_allocated_hourly_this_month: cur?.allocated ?? null,
    };
  });

  return apiOk({ data: enriched });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  const parsed = workCenterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const admin = createSupabaseAdminClient();
  const v = parsed.data;

  const { data, error } = await admin
    .from("work_centers")
    .insert({
      tenant_id: tenantId,
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      hourly_cost: v.hourly_cost,
      efficiency: v.efficiency,
      description: v.description ?? null,
      is_active: v.is_active,
      default_monthly_hours: v.default_monthly_hours,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return apiError(
      `Já existe um centro de trabalho com o código "${v.code}".`,
      409
    );
  }
  if (error) {
    return apiError(
      "Erro ao criar linha de produção: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }

  try {
    await ensureProductionLineForWorkCenter(admin, tenantId, {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      is_active: data.is_active,
    });
  } catch (syncErr) {
    return apiError(
      syncErr instanceof Error
        ? syncErr.message
        : "Linha criada mas falhou sincronização PCP",
      500
    );
  }

  return apiOk({ data }, 201);
}
