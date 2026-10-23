import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { accountsPayableUpdateSchema } from "@/shared/contracts/pacote-a-finance.schema";
import type { Database } from "@/modules/core/types/database";
import {
  appendNote,
  formatManualAdjustmentNote,
} from "@/modules/compras/lib/purchasing/purchase-payables";
import { buildPayableMovementDescription } from "@/modules/finance/lib/financial-movements";
import { asUntypedAdmin } from "@/shared/db/supabase/untyped-tables";
import { correctSettlementDate } from "@/modules/finance/lib/settlement-date-correction";
import { todayIsoSaoPaulo } from "@/shared/utils/date";

export const dynamic = "force-dynamic";

type AccountsPayableUpdate =
  Database["public"]["Tables"]["accounts_payable"]["Update"];

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  const gate = await assertMenuModuleAccess("faturamento");
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

  const parsed = accountsPayableUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Dados inválidos", 400, parsed.error.flatten());
  }

  const b = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: row, error: loadErr } = await admin
    .from("accounts_payable")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return apiError("Erro ao carregar: " + loadErr.message, 500);
  }
  if (!row) return apiError("Registro não encontrado", 404);

  let current_amount = Number(row.current_amount ?? 0);

  // Correção da data de uma conta JÁ paga (ex.: baixa em lote com a data de hoje):
  // ajusta o título e o movimento do extrato, mantendo o valor.
  if (
    row.status === "paid" &&
    b.payment_date &&
    b.pay_amount == null
  ) {
    if (!(await isCurrentUserTenantAdmin())) {
      return apiError("Apenas administradores podem corrigir a data de um pagamento já efetuado.", 403);
    }
    const fix = await correctSettlementDate(admin, {
      tenantId,
      sourceKind: "payable",
      sourceId: id,
      newDate: b.payment_date,
      previousDate: row.payment_date,
      previousNotes: b.notes !== undefined ? b.notes : row.notes,
    });
    if (!fix.ok) return apiError(fix.message, fix.status);
    b.payment_date = undefined;
    if (b.notes !== undefined) b.notes = undefined;
    const { data: fresh } = await admin
      .from("accounts_payable")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (fresh) Object.assign(row, fresh);
  }

  if (b.adjust_amount != null && b.pay_amount != null) {
    return apiError(
      "Use apenas ajuste de valor ou registo de pagamento, não ambos.",
      400
    );
  }

  if (b.adjust_amount != null) {
    if (row.status === "paid" || row.status === "cancelled") {
      return apiError(
        "Não é possível ajustar valor de conta paga ou cancelada.",
        400
      );
    }
    const newAmt = Math.round(b.adjust_amount * 100) / 100;
    if (newAmt <= 0) {
      return apiError("Valor ajustado deve ser positivo.", 400);
    }
    current_amount = newAmt;
  }

  const update: AccountsPayableUpdate = {};
  if (b.description !== undefined) update.description = b.description;
  if (b.category !== undefined) update.category = b.category;
  if (b.supplier_id !== undefined) update.supplier_id = b.supplier_id;
  if (b.due_date !== undefined) update.due_date = b.due_date;
  if (b.notes !== undefined) update.notes = b.notes;
  if (b.status !== undefined) update.status = b.status;
  if (
    b.current_amount !== undefined &&
    b.pay_amount == null &&
    b.adjust_amount == null
  ) {
    update.current_amount = b.current_amount;
  }
  if (b.payment_date !== undefined) update.payment_date = b.payment_date;
  if (b.adjust_amount != null) {
    const prev = Number(row.current_amount ?? 0);
    update.current_amount = current_amount;
    update.amount_locked = true;
    if (Math.abs(prev - current_amount) > 0.001) {
      update.notes = appendNote(
        row.notes,
        formatManualAdjustmentNote(prev, current_amount)
      );
    }
  }
  if (Object.keys(update).length === 0 && b.pay_amount == null) {
    return apiOk({ data: row });
  }

  let data: Record<string, unknown> = row;

  if (Object.keys(update).length > 0) {
    const { data: updRow, error } = await admin
      .from("accounts_payable")
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
    data = updRow;
  }

  if (b.pay_amount != null) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const movementDate = b.payment_date ?? todayIsoSaoPaulo();

    const rpcAdmin = asUntypedAdmin(admin);
    const { data: settled, error: settleErr } = await rpcAdmin.rpc(
      "fn_settle_payable",
      {
        p_tenant_id: tenantId,
        p_payable_id: id,
        p_amount: b.pay_amount,
        p_payment_date: movementDate,
        p_description: buildPayableMovementDescription(row.description),
        p_reference_id: row.purchase_order_id,
        p_created_by: user?.id ?? null,
      }
    );

    if (settleErr) {
      return apiError(
        "Erro ao registar pagamento: " + settleErr.message,
        400
      );
    }
    data = Array.isArray(settled) ? settled[0] : settled;

    // fn_settle_payable grava payment_date = CURRENT_DATE (UTC do servidor) ao quitar;
    // a data real é a informada na baixa (a mesma do movimento).
    const settledRow = data as { status?: string; payment_date?: string | null } | null;
    if (settledRow?.status === "paid" && settledRow.payment_date !== movementDate) {
      const { data: fixedRow } = await admin
        .from("accounts_payable")
        .update({ payment_date: movementDate })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .maybeSingle();
      if (fixedRow) data = fixedRow;
    }
  }

  return apiOk({ data });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Apenas administradores podem excluir.", 403);
  }

  const gate = await assertMenuModuleAccess("faturamento");
  if (!gate.ok) return gate.response;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("accounts_payable")
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
