import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiOk, supabaseErrorToHttp } from "@/lib/http";
import {
  getCurrentTenantId,
  isCurrentUserTenantAdmin,
} from "@/lib/utils/tenant";
import type { SalesGoalRow, SalesGoalUpdate } from "@/lib/types/sales.types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type GoalJoined = SalesGoalRow & {
  user: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

const DETAIL_SELECT = `
  *,
  user:user_profiles!sales_goals_user_profile_id_fkey(id, full_name, email)
`.trim();

function pct(goal: SalesGoalRow): number | null {
  if (goal.goal_amount <= 0) return null;
  return Math.round((goal.achieved_amount / goal.goal_amount) * 10000) / 100;
}

function mapGoal(row: GoalJoined) {
  return {
    ...row,
    progress_percent: pct(row),
  };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("sales_goals")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao buscar meta: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!data) return apiError("Meta não encontrada", 404);

  return apiOk({ data: mapGoal(data as unknown as GoalJoined) });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

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
  const updateData: SalesGoalUpdate = {};

  if (b.year !== undefined) {
    const y =
      typeof b.year === "number" ? b.year : parseInt(String(b.year), 10);
    if (!Number.isFinite(y)) return apiError("Ano inválido", 400);
    updateData.year = y;
  }
  if (b.month !== undefined) {
    const m =
      typeof b.month === "number" ? b.month : parseInt(String(b.month), 10);
    if (!Number.isFinite(m) || m < 1 || m > 12)
      return apiError("Mês inválido", 400);
    updateData.month = m;
  }
  if (b.goal_amount !== undefined) {
    const v =
      typeof b.goal_amount === "number"
        ? b.goal_amount
        : parseFloat(String(b.goal_amount));
    if (!Number.isFinite(v) || v <= 0) return apiError("goal_amount inválido", 400);
    updateData.goal_amount = v;
  }
  if (b.achieved_amount !== undefined) {
    const v =
      typeof b.achieved_amount === "number"
        ? b.achieved_amount
        : parseFloat(String(b.achieved_amount));
    if (!Number.isFinite(v) || v < 0) return apiError("achieved_amount inválido", 400);
    updateData.achieved_amount = v;
  }
  if (b.user_profile_id !== undefined) {
    if (b.user_profile_id === null) {
      updateData.user_profile_id = null;
    } else {
      const pid = String(b.user_profile_id);
      const { data: prof } = await admin
        .from("user_profiles")
        .select("id")
        .eq("id", pid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!prof) return apiError("Perfil / vendedor inválido", 400);
      updateData.user_profile_id = pid;
    }
  }
  if (b.notes !== undefined) {
    updateData.notes =
      b.notes === null ? null : String(b.notes).trim() || null;
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("Nenhum campo para atualizar", 400);
  }

  const { data: updated, error } = await admin
    .from("sales_goals")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(DETAIL_SELECT)
    .maybeSingle();

  if (error?.code === "23505") {
    return apiError("Conflito: meta já existe para período/vendedor", 409);
  }
  if (error) {
    return apiError(
      "Erro ao atualizar meta: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!updated) return apiError("Meta não encontrada", 404);

  return apiOk({ data: mapGoal(updated as unknown as GoalJoined) });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Não autenticado", 401);

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return apiError("Tenant não encontrado", 403);

  if (!(await isCurrentUserTenantAdmin())) {
    return apiError("Acesso negado", 403);
  }

  const admin = createSupabaseAdminClient();

  const { data: deleted, error } = await admin
    .from("sales_goals")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return apiError(
      "Erro ao excluir meta: " + error.message,
      supabaseErrorToHttp(error.code)
    );
  }
  if (!deleted) return apiError("Meta não encontrada", 404);

  return apiOk({ success: true });
}
