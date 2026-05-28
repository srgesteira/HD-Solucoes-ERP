import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/modules/core/lib/tenant";
import { assertMenuModuleAccess } from "@/modules/core/lib/module-access";
import { accountsPayableUpdateSchema } from "@/shared/contracts/pacote-a-finance.schema";
import type { Database } from "@/modules/core/types/database";

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
  let status = row.status as string;
  let payment_date = row.payment_date as string | null;

  if (b.pay_amount != null) {
    current_amount = Math.round((current_amount - b.pay_amount) * 100) / 100;
    if (current_amount < 0) {
      return apiError("Valor de pagamento superior ao saldo.", 400);
    }
    if (current_amount === 0) {
      status = "paid";
      payment_date = new Date().toISOString().slice(0, 10);
    } else {
      status = "pending";
    }
  }

  const update: AccountsPayableUpdate = {};
  if (b.description !== undefined) update.description = b.description;
  if (b.category !== undefined) update.category = b.category;
  if (b.supplier_id !== undefined) update.supplier_id = b.supplier_id;
  if (b.due_date !== undefined) update.due_date = b.due_date;
  if (b.notes !== undefined) update.notes = b.notes;
  if (b.status !== undefined) update.status = b.status;
  if (b.current_amount !== undefined && b.pay_amount == null) {
    update.current_amount = b.current_amount;
  }
  if (b.payment_date !== undefined) update.payment_date = b.payment_date;
  if (b.pay_amount != null) {
    update.current_amount = current_amount;
    update.status = status;
    update.payment_date = payment_date;
  }

  if (Object.keys(update).length === 0) {
    return apiOk({ data: row });
  }

  const { data, error } = await admin
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
