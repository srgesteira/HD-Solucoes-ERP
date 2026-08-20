import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/core/types/database";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { reconcilePendingBlingNfes } from "@/modules/fiscal/lib/bling/bling-reconcile";

export const dynamic = "force-dynamic";

type Admin = SupabaseClient<Database>;

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runAllTenants(admin: Admin) {
  const { data: tenants, error } = await admin.from("tenants").select("id");
  if (error) throw new Error(error.message);
  const results = [];
  for (const t of tenants ?? []) {
    try {
      results.push(await reconcilePendingBlingNfes(admin, t.id));
    } catch (e) {
      results.push({
        tenant_id: t.id,
        checked: 0,
        updated: 0,
        errors: [e instanceof Error ? e.message : "erro"],
      });
    }
  }
  return results;
}

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  if (isAuthorizedCronRequest(request)) {
    try {
      const tenants = await runAllTenants(admin);
      return apiOk({ data: { tenants } });
    } catch (e) {
      return apiError(
        e instanceof Error ? e.message : "Erro na reconciliação Bling.",
        500
      );
    }
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores.", 403);
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const result = await reconcilePendingBlingNfes(admin, tenantId);
    return apiOk({ data: result });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro na reconciliação Bling.",
      400
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
