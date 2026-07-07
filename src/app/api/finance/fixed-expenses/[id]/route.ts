import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseDueDay(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

function parseAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }
  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const update: Record<string, unknown> = {};

  if (b.description !== undefined) {
    const description = String(b.description).trim();
    if (!description) return apiError("Descrição é obrigatória", 400);
    update.description = description;
  }
  if (b.amount !== undefined) {
    const amount = parseAmount(b.amount);
    if (amount == null) return apiError("Valor inválido", 400);
    update.amount = amount;
  }
  if (b.due_day !== undefined) {
    const due_day = parseDueDay(b.due_day);
    if (due_day == null) {
      return apiError("Dia de vencimento deve ser entre 1 e 31", 400);
    }
    update.due_day = due_day;
  }
  if (b.cost_center_type !== undefined) {
    update.cost_center_type = String(b.cost_center_type).trim() || "fixed";
  }
  if (b.is_active !== undefined) {
    update.is_active = Boolean(b.is_active);
  }
  if (b.start_date !== undefined) {
    update.start_date =
      b.start_date == null ? null : String(b.start_date).slice(0, 10);
  }
  if (b.end_date !== undefined) {
    update.end_date =
      b.end_date == null || b.end_date === ""
        ? null
        : String(b.end_date).slice(0, 10);
  }

  const admin = asUntypedAdmin(createSupabaseAdminClient());

  if (Object.keys(update).length > 0) {
    const { error } = await admin
      .from("fixed_expenses")
      .update(update)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      return apiError(
        "Erro ao atualizar conta fixa: " + error.message,
        supabaseErrorToHttp(error.code)
      );
    }
  }

  if (b.override_competencia !== undefined && b.override_amount !== undefined) {
    const competencia = String(b.override_competencia).trim();
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return apiError("Competência inválida (use YYYY-MM)", 400);
    }
    if (b.override_amount == null || b.override_amount === "") {
      await admin
        .from("fixed_expense_overrides")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("fixed_expense_id", id)
        .eq("competencia", competencia);
    } else {
      const overrideAmount = parseAmount(b.override_amount);
      if (overrideAmount == null) return apiError("Valor do override inválido", 400);
      const { error: oErr } = await admin.from("fixed_expense_overrides").upsert(
        {
          tenant_id: tenantId,
          fixed_expense_id: id,
          competencia,
          amount: overrideAmount,
        },
        { onConflict: "tenant_id,fixed_expense_id,competencia" }
      );
      if (oErr) {
        return apiError("Erro ao salvar override: " + oErr.message, 400);
      }
    }
  }

  const { data, error: loadErr } = await admin
    .from("fixed_expenses")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) return apiError(loadErr.message, 500);
  if (!data) return apiError("Conta fixa não encontrada", 404);

  return apiOk({ data });
}
