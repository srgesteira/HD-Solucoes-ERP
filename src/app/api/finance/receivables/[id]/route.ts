import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { createSupabaseAdminClient } from "@/shared/db/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/modules/core/lib/http";
import { requireMenuModule } from "@/modules/core/lib/api-guards";
import { getCurrentTenantId } from "@/modules/core/lib/tenant";
import type { ReceivableUpdate } from "@/modules/core/types/finance.types";
import { RECEIVABLE_STATUSES } from "@/modules/core/types/finance.types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const RECEIVABLE_SET = new Set<string>(RECEIVABLE_STATUSES);

const DETAIL_SELECT = `
  *,
  sales_order:sales_orders!receivables_sales_order_id_fkey(
    id,
    order_number,
    client_name
  )
`.trim();

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("faturamento");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("receivables")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar conta a receber: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Título não encontrado", 404);

  return apiOk({ data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);
  const moduleDenied = await requireMenuModule("faturamento");
  if (moduleDenied) return moduleDenied;

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Body inválido", 400);
  }

  if (!body || typeof body !== "object") return apiError("Body inválido", 400);
  const b = body as Record<string, unknown>;

  const admin = createSupabaseAdminClient();

  const { data: current, error: curErr } = await admin
    .from("receivables")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (curErr) {
    return apiError(
      "Erro ao carregar título: " + curErr.message,
      supabaseErrorToHttp(curErr.code)
    );
  }
  if (!current) return apiError("Título não encontrado", 404);

  if (
    current.status === "paid" ||
    current.status === "cancelled"
  ) {
    return apiError("Título encerrado; não permite alteração de valores", 400);
  }

  const updateData: ReceivableUpdate = {};

  if (b.description !== undefined) {
    updateData.description =
      b.description === null ? null : String(b.description);
  }
  if (b.document_number !== undefined) {
    updateData.document_number =
      b.document_number === null ? null : String(b.document_number);
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes === null ? null : String(b.notes).trim() || null;
  }
  if (b.due_date !== undefined) {
    if (b.due_date === null) return apiError("due_date não pode ser nulo", 400);
    updateData.due_date = String(b.due_date).slice(0, 10);
  }
  if (b.issue_date !== undefined && b.issue_date !== null) {
    updateData.issue_date = String(b.issue_date).slice(0, 10);
  }
  if (b.client_name !== undefined) {
    updateData.client_name =
      b.client_name === null ? null : String(b.client_name);
  }
  if (b.client_document !== undefined) {
    updateData.client_document =
      b.client_document === null ? null : String(b.client_document);
  }
  if (b.status !== undefined) {
    const st = String(b.status);
    if (!RECEIVABLE_SET.has(st)) return apiError("Status inválido", 400);
    updateData.status = st;
    if (st === "cancelled") {
      updateData.payment_date = null;
    }
  }

  if (b.received_amount !== undefined) {
    const recv =
      typeof b.received_amount === "number"
        ? b.received_amount
        : parseFloat(String(b.received_amount));
    if (!Number.isFinite(recv) || recv <= 0) {
      return apiError("Valor recebido inválido", 400);
    }
    const curRem = Number(current.current_amount);
    if (recv - curRem > 0.01) {
      return apiError(
        `Valor maior que saldo atual (${curRem}).`,
        400
      );
    }

    const interestAdj =
      b.interest_adjustment !== undefined && b.interest_adjustment !== null
        ? typeof b.interest_adjustment === "number"
          ? b.interest_adjustment
          : parseFloat(String(b.interest_adjustment))
        : 0;
    const discountAdj =
      b.discount_adjustment !== undefined && b.discount_adjustment !== null
        ? typeof b.discount_adjustment === "number"
          ? b.discount_adjustment
          : parseFloat(String(b.discount_adjustment))
        : 0;
    if (!Number.isFinite(interestAdj) || interestAdj < 0)
      return apiError("interest_adjustment inválido", 400);
    if (!Number.isFinite(discountAdj) || discountAdj < 0)
      return apiError("discount_adjustment inválido", 400);

    const newPaid = roundMoney(Number(current.paid_amount) + recv);
    let newCurrent = roundMoney(
      Number(current.current_amount) - recv + interestAdj - discountAdj
    );

    updateData.interest_amount = roundMoney(
      Number(current.interest_amount) + interestAdj
    );
    updateData.discount_amount = roundMoney(
      Number(current.discount_amount) + discountAdj
    );
    updateData.paid_amount = newPaid;

    const payDateRaw =
      typeof b.payment_date === "string" && b.payment_date.trim()
        ? String(b.payment_date).slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    if (newCurrent <= 0.005) {
      updateData.current_amount = 0;
      updateData.status = "paid";
      updateData.payment_date = payDateRaw;
    } else {
      updateData.current_amount = newCurrent;
      updateData.status = "partial";
      updateData.payment_date = payDateRaw;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const { data: updated, error } = await admin
    .from("receivables")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao atualizar título: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!updated) return apiError("Título não encontrado", 404);

  const { data: detail } = await admin
    .from("receivables")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return apiOk({ data: detail ?? updated });
}
