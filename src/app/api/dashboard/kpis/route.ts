import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import {
  getModuleKpis,
  KPI_MODULE_KEYS,
  type DashboardKpiResponse,
} from "@/modules/core/lib/dashboard/module-kpis";
import { userHasModule, normalizeEnabledModules } from "@/shared/auth/menu-modules";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { loadProfileAccess } = await import("@/modules/core/lib/profile-access");
  const profile = await loadProfileAccess(user.id);

  const role = profile?.role ?? "member";
  const mods = normalizeEnabledModules(profile?.enabled_modules, role);

  const requested =
    request.nextUrl.searchParams.get("module")?.trim() ?? null;

  const keys = requested
    ? [requested]
    : KPI_MODULE_KEYS.filter((k) => {
        if (role === "admin" || mods.includes("*")) return true;
        if (!mods.length) return true;
        return userHasModule({ role, enabled_modules: mods }, k);
      });

  const modules: Record<string, DashboardKpiResponse> = {};
  for (const key of keys) {
    const data = await getModuleKpis(key, tenantId);
    if (data) modules[key] = data;
  }

  if (requested && !modules[requested]) {
    return apiError("Módulo sem KPIs ou sem acesso", 404);
  }

  return apiOk({ modules, timestamp: new Date().toISOString() });
}
