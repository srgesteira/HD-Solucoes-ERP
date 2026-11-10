import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk } from "@/modules/core/lib/http";
import { assertComprasOrFaturamentoAccess } from "@/modules/core/lib/module-access";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { getBlingConnectionStatus } from "@/modules/fiscal/lib/bling/bling-client";
import { syncInboundNfeInboxFromBling } from "@/modules/faturamento/lib/bling-received-nfe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza NF-e emitidas contra o CNPJ a partir do Bling (Notas de entrada)
 * → inbox de NF recebidas + contas a pagar (quando não há PC).
 *
 * - Cron (Authorization: Bearer CRON_SECRET): todos os tenants com Bling conectado.
 * - Sessão admin: tenant atual. `?dias=N` (padrão 45).
 */
function isCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const daysParam = Number(request.nextUrl.searchParams.get("dias") ?? "");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;

  if (isCron(request)) {
    const { data: tenants, error } = await admin.from("tenants").select("id");
    if (error) return apiError(error.message, 500);
    const out = [];
    for (const t of tenants ?? []) {
      try {
        const st = await getBlingConnectionStatus(admin, t.id);
        if (!st.connected) continue;
        out.push({ tenant_id: t.id, ...(await syncInboundNfeInboxFromBling(admin, t.id, { days })) });
      } catch (e) {
        out.push({ tenant_id: t.id, error: e instanceof Error ? e.message : "erro" });
      }
    }
    return apiOk({ data: out });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const access = await assertComprasOrFaturamentoAccess();
  if (!access.ok) return access.response;
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem sincronizar NF recebidas.", 403);
  }
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  try {
    const st = await getBlingConnectionStatus(admin, tenantId);
    if (!st.connected) return apiError("Bling não conectado.", 400);
    const result = await syncInboundNfeInboxFromBling(admin, tenantId, { days });
    return apiOk({ data: result });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "Erro ao sincronizar NF recebidas do Bling",
      400
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
