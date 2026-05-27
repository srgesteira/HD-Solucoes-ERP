import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentTenantId } from "@/lib/utils/tenant";
import { currentUserCanPcpPlanning } from "@/lib/pcp-api-auth";
import { checkProductionDateVsPurchases } from "@/lib/purchasing/purchase-schedule-conflicts";

export const dynamic = "force-dynamic";

function toDateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).slice(0, 10);
}

function toTimestamp(v: unknown): string | null {
  const d = toDateOnly(v);
  if (!d) return null;
  return `${d}T12:00:00.000Z`;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  if (!(await currentUserCanPcpPlanning())) {
    return apiError("Sem permissão para planeamento PCP", 403);
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const orderItemId =
    typeof b.order_item_id === "string" ? b.order_item_id : null;
  if (!orderItemId) return apiError("order_item_id é obrigatório", 400);

  const patch: {
    production_start?: string | null;
    production_end?: string | null;
    production_notes?: string | null;
    status?: string;
  } = {};
  if (b.production_start !== undefined) {
    patch.production_start = toTimestamp(b.production_start);
  }
  if (b.production_end !== undefined) {
    patch.production_end = toTimestamp(b.production_end);
  }
  if (b.production_notes !== undefined) {
    patch.production_notes =
      typeof b.production_notes === "string"
        ? b.production_notes.trim() || null
        : null;
  }

  if (Object.keys(patch).length === 0) {
    return apiError("Nenhum campo para actualizar", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("order_items")
    .select("id, production_start, production_end, production_notes, status")
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return apiError("Item de produção não encontrado", 404);

  const start =
    patch.production_start !== undefined
      ? patch.production_start
      : existing.production_start;
  const end =
    patch.production_end !== undefined
      ? patch.production_end
      : existing.production_end;

  if (start && end) {
    const s = toDateOnly(start);
    const e = toDateOnly(end);
    if (s && e && e < s) {
      return apiError("Fim de produção não pode ser anterior ao início", 400);
    }
  }

  const force =
    b.force === true || b.force === "true" || b.ignore_conflict === true;
  const overrideNote =
    typeof b.override_note === "string" ? b.override_note.trim() : "";

  if (!force) {
    if (patch.production_end !== undefined) {
      const check = await checkProductionDateVsPurchases(
        admin,
        tenantId,
        orderItemId,
        "production_end",
        patch.production_end ?? null
      );
      if (check.conflict) {
        return apiOk({
          conflict: check,
          suggested_production_end: check.suggested_end,
        }, 409);
      }
    }
    if (patch.production_start !== undefined) {
      const check = await checkProductionDateVsPurchases(
        admin,
        tenantId,
        orderItemId,
        "production_start",
        patch.production_start ?? null
      );
      if (check.conflict) {
        return apiOk({
          conflict: check,
          suggested_production_end: check.suggested_end,
        }, 409);
      }
    }
  }

  if (force && overrideNote) {
    const prev =
      typeof existing.production_notes === "string"
        ? existing.production_notes.trim()
        : "";
    patch.production_notes = prev
      ? `${prev}\n[PC conflito] ${overrideNote}`
      : `[PC conflito] ${overrideNote}`;
  }

  if (patch.production_start || patch.production_end) {
    if (existing.status === "pending" || existing.status === "planned") {
      patch.status = "in_progress";
    }
  }

  const { data, error } = await admin
    .from("order_items")
    .update(patch)
    .eq("id", orderItemId)
    .eq("tenant_id", tenantId)
    .select("id, production_start, production_end, production_notes, status")
    .maybeSingle();

  if (error) return apiError(error.message, 400);
  if (!data) return apiError("Item de produção não encontrado", 404);

  return apiOk(data);
}
