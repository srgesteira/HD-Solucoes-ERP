import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { computeLaborCostBreakdown } from "@/modules/rh/lib/labor-cost-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) {
    const prod = await assertMenuModuleAccess("producao");
    if (!prod.ok) return gate.response;
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const sp = request.nextUrl.searchParams;
  const now = new Date();
  const year = Number(sp.get("year") ?? now.getFullYear());
  const month = Number(sp.get("month") ?? now.getMonth() + 1);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return apiError("Ano/mês inválidos", 400);
  }

  const admin = createSupabaseAdminClient();

  try {
    const breakdown = await computeLaborCostBreakdown(
      admin,
      tenantId,
      year,
      month
    );

    const { data: wcRows } = await admin
      .from("work_centers")
      .select("id, code, name")
      .eq("tenant_id", tenantId);

    const wcMeta = new Map(
      (wcRows ?? []).map((w) => [w.id, { code: w.code, name: w.name }])
    );

    const lines = breakdown.lines.map((l) => {
      const meta = wcMeta.get(l.work_center_id);
      return {
        ...l,
        code: meta?.code ?? "",
        name: meta?.name ?? "",
        final_cost: l.direct_cost + l.allocated_cost,
      };
    });

    const departments = breakdown.departments.map((d) => ({
      ...d,
      by_line: d.by_line.map((bl) => ({
        ...bl,
        code: wcMeta.get(bl.work_center_id)?.code ?? "",
        name: wcMeta.get(bl.work_center_id)?.name ?? "",
      })),
    }));

    return apiOk({
      year,
      month,
      lines,
      departments,
    });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao calcular breakdown",
      500
    );
  }
}
